// Configuration: validates the `ru_market` block of a portals.yml entry.
//
// Everything that decides which sources run and how they are paged is checked
// here, once, so providers can trust their `cfg` argument. All failures are
// SourceError('config', ...) with a message that names the offending option.
import { SourceError } from './errors.mjs';

export const DEFAULT_SOURCES = ['habr-career', 'geekjob'];
export const SOURCES = [...DEFAULT_SOURCES, 'superjob', 'trudvsem', 'getmatch', 'helloworld-rs'];

/** Source id -> key under `ru_market.sources`. */
const CONFIG_KEYS = {
  'habr-career': 'habr_career',
  geekjob: 'geekjob',
  superjob: 'superjob',
  trudvsem: 'trudvsem',
  getmatch: 'getmatch',
  'helloworld-rs': 'helloworld_rs',
};
const API_SOURCES = ['superjob', 'trudvsem', 'getmatch'];
const GETMATCH_FILTERS = ['sa', 'pa', 'se', 'l'];
const GETMATCH_LIST_FILTERS = ['se', 'l'];
const GETMATCH_FILTER_VALUE = /^[\p{L}\p{N}_.:\- ]{1,64}$/u;
const HABR_CATEGORY = /^[a-z0-9_]+$/;
/** Allowed lengths of `primary_source_order`: core pair, four, five or all sources. */
const ORDER_LENGTHS = [DEFAULT_SOURCES.length, 4, 5, SOURCES.length];
const MAX_PAGES = 20;
const MAX_PER_PAGE = 100;
const MAX_LIST_ITEMS = 20;
const MAX_ITEM_LENGTH = 500;

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new SourceError('config', message);
}

/**
 * @param {string} where Option path, for the message.
 * @returns {never}
 */
function hhRemoved(where) {
  fail(
    `${where}: the HH API adapter was removed in 0.7.0. ` +
      'Collect HH with the browser companion through a core local-parser entry (see companion/README.md)',
  );
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, any>} The same value, checked to be a plain object.
 */
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} max
 * @returns {number} The same value, checked to be an integer in 1..max.
 */
function integer(value, label, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) fail(`${label} must be an integer from 1 to ${max}`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {RegExp} [pattern] Every item must match when given.
 * @returns {string[]} Trimmed, de-duplicated items.
 */
function strings(value, label, pattern) {
  const itemInvalid = x =>
    typeof x !== 'string' || !x.trim() || x.length > MAX_ITEM_LENGTH || (pattern && !pattern.test(x));
  if (!Array.isArray(value) || !value.length || value.length > MAX_LIST_ITEMS || value.some(itemInvalid)) {
    fail(`${label} must be a non-empty array of at most ${MAX_LIST_ITEMS} valid strings`);
  }
  return [...new Set(value.map(x => x.trim()))];
}

/**
 * @param {Record<string, any>} raw One source's config block.
 * @param {string[]} supported Allowed option names.
 * @param {string} label For the message, for example `getmatch`.
 */
function rejectUnknownOptions(raw, supported, label) {
  for (const key of Object.keys(raw)) {
    if (!supported.includes(key)) fail(`Unsupported ${label} option: ${key}`);
  }
}

/**
 * Validate `primary_source_order`.
 * @param {unknown} order
 * @returns {string[]}
 */
function validateOrder(order) {
  if (Array.isArray(order) && order.includes('hh')) hhRemoved('primary_source_order');
  const invalid =
    !Array.isArray(order) ||
    !ORDER_LENGTHS.includes(order.length) ||
    new Set(order).size !== order.length ||
    order.some(x => !SOURCES.includes(x)) ||
    SOURCES.slice(0, order.length).some(x => !order.includes(x));
  if (invalid) {
    fail('primary_source_order must contain the two core sources, the four, five or all six sources, exactly once');
  }
  return order;
}

/**
 * @param {Record<string, any>} raw
 * @param {Record<string, any>} cfg Mutated: gets `queries`.
 */
function applyHelloWorldOptions(raw, cfg) {
  rejectUnknownOptions(raw, ['enabled', 'mode', 'max_pages', 'queries'], 'helloworld_rs');
  cfg.queries = raw.queries === undefined && !cfg.enabled ? [] : strings(raw.queries, 'helloworld_rs.queries');
}

/**
 * Read one experimental getmatch filter. List filters keep several values; the others one.
 * @param {Record<string, any>} raw
 * @param {string} key
 * @returns {string | string[]}
 */
function getmatchFilter(raw, key) {
  const isList = GETMATCH_LIST_FILTERS.includes(key);
  const values = (Array.isArray(raw[key]) ? raw[key] : [raw[key]]).map(x => (typeof x === 'number' ? String(x) : x));
  if (!isList && Array.isArray(raw[key])) fail(`getmatch.${key} must be a single value`);
  const invalid =
    !values.length || values.length > 10 || values.some(x => typeof x !== 'string' || !GETMATCH_FILTER_VALUE.test(x));
  if (invalid) fail(`getmatch.${key} must be 1 to 10 short strings or numbers`);
  return isList ? [...new Set(values)] : values[0];
}

/**
 * @param {Record<string, any>} raw
 * @param {Record<string, any>} cfg Mutated: gets `per_page` and the filters.
 */
function applyGetmatchOptions(raw, cfg) {
  rejectUnknownOptions(raw, ['enabled', 'mode', 'max_pages', 'per_page', ...GETMATCH_FILTERS], 'getmatch');
  cfg.per_page = integer(raw.per_page ?? 20, 'getmatch.per_page', MAX_PER_PAGE);
  // Unverified experimental filters, sent only when explicitly configured.
  for (const key of GETMATCH_FILTERS) {
    if (raw[key] !== undefined) cfg[key] = getmatchFilter(raw, key);
  }
}

/**
 * @param {Record<string, any>} raw
 * @param {Record<string, any>} cfg Mutated: gets `categories` and `remote`.
 */
function applyHabrOptions(raw, cfg) {
  cfg.categories =
    raw.categories === undefined ? [''] : strings(raw.categories, 'habr_career.categories', HABR_CATEGORY);
  if (raw.remote !== undefined && typeof raw.remote !== 'boolean') fail('habr_career.remote must be boolean');
  cfg.remote = raw.remote ?? false;
}

/**
 * @param {string} id `superjob` or `trudvsem`.
 * @param {Record<string, any>} raw
 * @param {Record<string, any>} cfg Mutated: gets `queries` and `per_page`.
 */
function applySearchApiOptions(id, raw, cfg) {
  cfg.queries = raw.queries === undefined ? [''] : strings(raw.queries, `${id}.queries`);
  cfg.per_page = integer(raw.per_page ?? (id === 'superjob' ? 20 : MAX_PER_PAGE), `${id}.per_page`, MAX_PER_PAGE);
}

/**
 * Validate the options every source shares, then the source-specific ones.
 * @param {string} id Source id.
 * @param {Record<string, any>} raw The source's config block.
 * @param {number} sharedPages Default `max_pages`.
 * @returns {Record<string, any>} Normalised source config.
 */
function sourceConfig(id, raw, sharedPages) {
  if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') fail(`${id}.enabled must be boolean`);
  const isApi = API_SOURCES.includes(id);
  const mode = raw.mode ?? (isApi ? 'api' : 'html');
  if (!(isApi ? ['api', 'auto'] : ['html', 'auto']).includes(mode)) fail(`Unsupported ${id} mode: ${mode}`);
  const cfg = {
    enabled: raw.enabled ?? DEFAULT_SOURCES.includes(id),
    mode,
    max_pages: integer(raw.max_pages ?? sharedPages, `${id}.max_pages`, MAX_PAGES),
  };
  if (id === 'helloworld-rs') applyHelloWorldOptions(raw, cfg);
  if (id === 'getmatch') applyGetmatchOptions(raw, cfg);
  if (id === 'habr-career') applyHabrOptions(raw, cfg);
  if (id === 'superjob' || id === 'trudvsem') applySearchApiOptions(id, raw, cfg);
  return cfg;
}

/**
 * Validate a portals.yml entry.
 * @param {{ ru_market?: Record<string, any> }} entry
 * @returns {{ selected: string[], sources: Record<string, any>, order: string[] }}
 *   Enabled source ids, per-source config and the full source preference order.
 * @throws {SourceError} `config` for any invalid option.
 */
export function parseConfig(entry) {
  const config = object(entry?.ru_market, 'ru_market');
  const source = config.source ?? 'all';
  if (source === 'hh') hhRemoved('source');
  if (source !== 'all' && !SOURCES.includes(source)) fail(`Unsupported source: ${source}`);
  const sharedPages = integer(config.max_pages ?? 1, 'max_pages', MAX_PAGES);
  const supplied = object(config.sources ?? {}, 'sources');
  if ('hh' in supplied) hhRemoved('sources.hh');
  for (const name of Object.keys(supplied)) {
    if (!Object.values(CONFIG_KEYS).includes(name)) fail(`Unsupported source config: ${name}`);
  }
  const order = validateOrder(config.primary_source_order ?? DEFAULT_SOURCES);
  const sources = {};
  for (const id of SOURCES) {
    const raw = object(supplied[CONFIG_KEYS[id]] ?? {}, `sources.${CONFIG_KEYS[id]}`);
    sources[id] = sourceConfig(id, raw, sharedPages);
  }
  const selected = (source === 'all' ? SOURCES : [source]).filter(id => sources[id].enabled);
  if (!selected.length) fail('No enabled sources selected');
  return { selected, sources, order: [...order, ...SOURCES.filter(x => !order.includes(x))] };
}
