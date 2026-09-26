import { SourceError } from './errors.mjs';

export const SOURCES = ['hh', 'habr-career', 'geekjob'];
const keys = { hh: 'hh', 'habr-career': 'habr_career', geekjob: 'geekjob' };
const fail = message => { throw new SourceError('config', message); };
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}
function integer(value, label, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) fail(`${label} must be an integer from 1 to ${max}`);
  return value;
}
function strings(value, label, pattern) {
  if (!Array.isArray(value) || !value.length || value.length > 20
    || value.some(x => typeof x !== 'string' || !x.trim() || x.length > 500 || (pattern && !pattern.test(x)))) {
    fail(`${label} must be a non-empty array of at most 20 valid strings`);
  }
  return [...new Set(value.map(x => x.trim()))];
}

export function parseConfig(entry) {
  const config = object(entry?.ru_market, 'ru_market');
  const source = config.source ?? 'all';
  if (source !== 'all' && !SOURCES.includes(source)) fail(`Unsupported source: ${source}`);
  const sharedPages = integer(config.max_pages ?? 1, 'max_pages', 20);
  const supplied = object(config.sources ?? {}, 'sources');
  for (const name of Object.keys(supplied)) if (!Object.values(keys).includes(name)) fail(`Unsupported source config: ${name}`);
  const order = config.primary_source_order ?? SOURCES;
  if (!Array.isArray(order) || order.length !== 3 || new Set(order).size !== 3 || order.some(x => !SOURCES.includes(x))) {
    fail('primary_source_order must contain hh, habr-career and geekjob exactly once');
  }
  const sources = {};
  for (const id of SOURCES) {
    const raw = object(supplied[keys[id]] ?? {}, `sources.${keys[id]}`);
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') fail(`${id}.enabled must be boolean`);
    const mode = raw.mode ?? (id === 'hh' ? 'api' : 'html');
    if (!(id === 'hh' ? ['api', 'auto'] : ['html', 'auto']).includes(mode)) fail(`Unsupported ${id} mode: ${mode}`);
    const cfg = { enabled: raw.enabled ?? true, mode, max_pages: integer(raw.max_pages ?? sharedPages, `${id}.max_pages`, 20) };
    if (id === 'hh') {
      cfg.queries = raw.queries === undefined ? [''] : strings(raw.queries, 'hh.queries');
      cfg.per_page = integer(raw.per_page ?? 50, 'hh.per_page', 100);
      cfg.host = raw.host ?? 'hh.ru';
      if (cfg.host !== 'hh.ru') fail('Only hh.ru is supported in v1');
      cfg.locale = raw.locale ?? 'RU';
      if (!['RU', 'EN'].includes(cfg.locale)) fail('hh.locale must be RU or EN');
      if (raw.area !== undefined && raw.area !== '' && !/^\d+$/.test(String(raw.area))) fail('hh.area must be an area ID');
      cfg.area = raw.area ?? '';
      if (raw.schedule !== undefined && !['', 'remote', 'fullDay', 'shift', 'flexible', 'flyInFlyOut'].includes(raw.schedule)) fail('Invalid hh.schedule');
      cfg.schedule = raw.schedule ?? '';
      if (raw.period !== undefined) cfg.period = integer(raw.period, 'hh.period', 30);
    }
    if (id === 'habr-career') {
      cfg.categories = raw.categories === undefined ? [''] : strings(raw.categories, 'habr_career.categories', /^[a-z0-9_]+$/);
      if (raw.remote !== undefined && typeof raw.remote !== 'boolean') fail('habr_career.remote must be boolean');
      cfg.remote = raw.remote ?? false;
    }
    sources[id] = cfg;
  }
  const selected = (source === 'all' ? SOURCES : [source]).filter(id => sources[id].enabled);
  if (!selected.length) fail('No enabled sources selected');
  return { selected, sources, order: [...order] };
}
