import { SourceError } from './errors.mjs';

export const DEFAULT_SOURCES = ['habr-career', 'geekjob'];
export const SOURCES = [...DEFAULT_SOURCES, 'superjob', 'trudvsem', 'getmatch', 'helloworld-rs'];
const keys = { 'habr-career': 'habr_career', geekjob: 'geekjob', superjob: 'superjob', trudvsem: 'trudvsem', getmatch: 'getmatch', 'helloworld-rs': 'helloworld_rs' };
const fail = message => { throw new SourceError('config', message); };
const GETMATCH_FILTERS = ['sa', 'pa', 'se', 'l'];
const ORDER_LENGTHS = [DEFAULT_SOURCES.length, 4, 5, SOURCES.length];
const hhRemoved = where => fail(`${where}: the HH API adapter was removed in 0.7.0. Collect HH with the browser companion through a core local-parser entry (see companion/README.md)`);
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
  if (source === 'hh') hhRemoved('source');
  if (source !== 'all' && !SOURCES.includes(source)) fail(`Unsupported source: ${source}`);
  const sharedPages = integer(config.max_pages ?? 1, 'max_pages', 20);
  const supplied = object(config.sources ?? {}, 'sources');
  if ('hh' in supplied) hhRemoved('sources.hh');
  for (const name of Object.keys(supplied)) if (!Object.values(keys).includes(name)) fail(`Unsupported source config: ${name}`);
  const order = config.primary_source_order ?? DEFAULT_SOURCES;
  if (Array.isArray(order) && order.includes('hh')) hhRemoved('primary_source_order');
  if (!Array.isArray(order) || !ORDER_LENGTHS.includes(order.length)
    || new Set(order).size !== order.length || order.some(x => !SOURCES.includes(x))
    || SOURCES.slice(0, order.length).some(x => !order.includes(x))) {
    fail('primary_source_order must contain the two core sources, the four, five or all six sources, exactly once');
  }
  const sources = {};
  for (const id of SOURCES) {
    const raw = object(supplied[keys[id]] ?? {}, `sources.${keys[id]}`);
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') fail(`${id}.enabled must be boolean`);
    const api = ['superjob', 'trudvsem', 'getmatch'].includes(id);
    const mode = raw.mode ?? (api ? 'api' : 'html');
    if (!(api ? ['api', 'auto'] : ['html', 'auto']).includes(mode)) fail(`Unsupported ${id} mode: ${mode}`);
    const cfg = { enabled: raw.enabled ?? DEFAULT_SOURCES.includes(id), mode, max_pages: integer(raw.max_pages ?? sharedPages, `${id}.max_pages`, 20) };
    if (id === 'helloworld-rs') {
      const supported = new Set(['enabled', 'mode', 'max_pages', 'queries']);
      for (const key of Object.keys(raw)) if (!supported.has(key)) fail(`Unsupported helloworld_rs option: ${key}`);
      cfg.queries = raw.queries === undefined && !cfg.enabled ? [] : strings(raw.queries, 'helloworld_rs.queries');
    }
    if (id === 'getmatch') {
      const supported = new Set(['enabled', 'mode', 'max_pages', 'per_page', ...GETMATCH_FILTERS]);
      for (const key of Object.keys(raw)) if (!supported.has(key)) fail(`Unsupported getmatch option: ${key}`);
      cfg.per_page = integer(raw.per_page ?? 20, 'getmatch.per_page', 100);
      // Unverified experimental filters, sent only when explicitly configured.
      for (const key of GETMATCH_FILTERS) {
        if (raw[key] === undefined) continue;
        const values = (Array.isArray(raw[key]) ? raw[key] : [raw[key]]).map(x => typeof x === 'number' ? String(x) : x);
        if (!['se', 'l'].includes(key) && Array.isArray(raw[key])) fail(`getmatch.${key} must be a single value`);
        if (!values.length || values.length > 10 || values.some(x => typeof x !== 'string' || !/^[\p{L}\p{N}_.:\- ]{1,64}$/u.test(x))) fail(`getmatch.${key} must be 1 to 10 short strings or numbers`);
        cfg[key] = ['se', 'l'].includes(key) ? [...new Set(values)] : values[0];
      }
    }
    if (id === 'habr-career') {
      cfg.categories = raw.categories === undefined ? [''] : strings(raw.categories, 'habr_career.categories', /^[a-z0-9_]+$/);
      if (raw.remote !== undefined && typeof raw.remote !== 'boolean') fail('habr_career.remote must be boolean');
      cfg.remote = raw.remote ?? false;
    }
    if (id === 'superjob' || id === 'trudvsem') {
      cfg.queries = raw.queries === undefined ? [''] : strings(raw.queries, `${id}.queries`);
      cfg.per_page = integer(raw.per_page ?? (id === 'superjob' ? 20 : 100), `${id}.per_page`, 100);
    }
    sources[id] = cfg;
  }
  const selected = (source === 'all' ? SOURCES : [source]).filter(id => sources[id].enabled);
  if (!selected.length) fail('No enabled sources selected');
  return { selected, sources, order: [...order, ...SOURCES.filter(x => !order.includes(x))] };
}
