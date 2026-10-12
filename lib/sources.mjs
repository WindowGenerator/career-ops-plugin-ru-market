// Source registry: the one place that knows which job sources exist.
//
// Ids, display names, config keys, transport, hosts, vacancy paths, request
// spacing and the stop-on-access-error flag are read by several modules, so they
// live here as plain data. This module imports nothing from `lib/`, so config,
// transport and processors can all import it without a cycle. Do not import it
// from `lib/untrusted.mjs`, which is shipped by path and hash.
//
// Persisted strings (ids, config keys, hosts) are pinned by literal test
// expectations and by `manifest.json`; change them only on purpose.

/**
 * @typedef {object} SourceEntry
 * @property {string} id Source id used in notes, logs and `primary_source_order`.
 * @property {string} [label] Display name in notes; absent means the raw id is shown.
 * @property {string} configKey Key under `ru_market.sources` in portals.yml.
 * @property {'api' | 'html'} transport
 * @property {boolean} default Enabled without explicit config.
 * @property {string} vacancyHost Host of canonical vacancy URLs.
 * @property {RegExp} vacancyPath Accepted vacancy paths; anything else is not a card link.
 * @property {string} listingHost Host of the listing request, as in `manifest.json` `allowedHosts`.
 * @property {number} spacingMs Minimum gap between requests to `listingHost`.
 * @property {boolean} stopOnAccessError An `access` error stops all remaining routes.
 */

/**
 * @param {SourceEntry} entry
 * @returns {Readonly<SourceEntry>}
 */
const entry = entry => Object.freeze(entry);

/**
 * Source id -> entry. Key order is the canonical source order.
 * @type {Readonly<Record<string, Readonly<SourceEntry>>>}
 */
export const SOURCE_REGISTRY = Object.freeze({
  'habr-career': entry({
    id: 'habr-career',
    label: 'Habr Career',
    configKey: 'habr_career',
    transport: 'html',
    default: true,
    vacancyHost: 'career.habr.com',
    vacancyPath: /^\/vacancies\/\d+\/?$/,
    listingHost: 'career.habr.com',
    spacingMs: 750,
    stopOnAccessError: false,
  }),
  geekjob: entry({
    id: 'geekjob',
    label: 'GeekJob',
    configKey: 'geekjob',
    transport: 'html',
    default: true,
    vacancyHost: 'geekjob.ru',
    vacancyPath: /^\/vacancy\/[a-f0-9]{24}\/?$/i,
    listingHost: 'geekjob.ru',
    spacingMs: 750,
    stopOnAccessError: false,
  }),
  superjob: entry({
    id: 'superjob',
    label: 'SuperJob',
    configKey: 'superjob',
    transport: 'api',
    default: false,
    vacancyHost: 'www.superjob.ru',
    vacancyPath: /^\/vakansii\/[a-z0-9-]+-\d+(?:-\d+)?\.html$/i,
    listingHost: 'api.superjob.ru',
    spacingMs: 750,
    stopOnAccessError: false,
  }),
  trudvsem: entry({
    id: 'trudvsem',
    label: 'Работа России',
    configKey: 'trudvsem',
    transport: 'api',
    default: false,
    vacancyHost: 'trudvsem.ru',
    vacancyPath: /^\/vacancy\/card\/[a-z0-9-]+\/[a-f0-9-]+\/?$/i,
    listingHost: 'opendata.trudvsem.ru',
    spacingMs: 750,
    stopOnAccessError: false,
  }),
  getmatch: entry({
    id: 'getmatch',
    label: 'getmatch',
    configKey: 'getmatch',
    transport: 'api',
    default: false,
    vacancyHost: 'getmatch.ru',
    vacancyPath: /^\/vacancies\/[1-9]\d*-[a-z0-9]+(?:-[a-z0-9]+)*\/?$/i,
    listingHost: 'getmatch.ru',
    spacingMs: 1000,
    stopOnAccessError: true,
  }),
  // LEGACY(parser-pipeline): no `label`, so notes show the raw id
  // (`cross-listed: helloworld-rs <url>`). Pinned by a test; the name is not added.
  'helloworld-rs': entry({
    id: 'helloworld-rs',
    configKey: 'helloworld_rs',
    transport: 'html',
    default: false,
    vacancyHost: 'www.helloworld.rs',
    vacancyPath: /^\/posao\/[^/]+\/[^/]+\/[1-9]\d*\/?$/,
    listingHost: 'www.helloworld.rs',
    spacingMs: 1000,
    stopOnAccessError: true,
  }),
});

/** Source ids in canonical order. */
export const SOURCE_IDS = Object.freeze(Object.keys(SOURCE_REGISTRY));

/** Ids enabled without explicit config, in canonical order. */
export const DEFAULT_SOURCE_IDS = Object.freeze(
  SOURCE_IDS.filter(id => SOURCE_REGISTRY[id].default),
);

/** Distinct listing hosts, the egress allowlist. */
export const LISTING_HOSTS = Object.freeze([
  ...new Set(SOURCE_IDS.map(id => SOURCE_REGISTRY[id].listingHost)),
]);
