// getmatch provider: undocumented JSON endpoint https://getmatch.ru/api/offers.
//
// A page is `{ offers: [...], meta: { total, offset, limit } }`. Offers may
// include promotions and inactive vacancies; only active vacancies become
// jobs. Pagination is offset-based and verified on every page.
import { clean, jobUrl, structuredSalary } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';

const API_URL = 'https://getmatch.ru/api/offers';
const TIMEZONE_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const VACANCY_ID_IN_PATH = /^\/vacancies\/(\d+)-/;
const FORMAT_LABELS = {
  office: 'Офис',
  hybrid: 'Гибрид',
  remote: 'Удалённо',
  relocation_company: 'Релокация за счёт компании',
  relocation_candidate: 'Релокация за свой счёт',
};

/**
 * @param {string} message
 * @returns {never}
 */
function broken(message) {
  // LEGACY(parser-pipeline): `broken` is redefined in helloworld.mjs; left duplicated.
  throw new SourceError('broken-markup', message);
}

/**
 * @param {any} meta `meta` object of a response.
 * @returns {boolean} True when total, offset and limit are sane integers.
 */
function isValidMeta(meta) {
  return (
    Boolean(meta) &&
    Number.isSafeInteger(meta.total) &&
    meta.total >= 0 &&
    Number.isSafeInteger(meta.offset) &&
    meta.offset >= 0 &&
    Number.isSafeInteger(meta.limit) &&
    meta.limit >= 1
  );
}

/**
 * Throw unless the vacancy offer has the identity fields we rely on.
 * @param {any} item
 */
function checkVacancyIdentity(item) {
  const url = jobUrl(item.url, 'getmatch');
  const valid =
    Number.isSafeInteger(item.id) &&
    item.id >= 1 &&
    typeof item.is_active === 'boolean' &&
    clean(item.position) &&
    url &&
    Number(new URL(url).pathname.match(VACANCY_ID_IN_PATH)[1]) === item.id;
  if (!valid) broken('Invalid getmatch vacancy');
}

/**
 * Throw unless the offer's location list, when present, has the expected shape.
 * @param {any} item
 */
function checkLocations(item) {
  const locations = item.location_items;
  if (locations == null) return;
  const itemValid = x =>
    x && typeof x.label === 'string' && typeof x.format === 'string' && typeof x.exclude === 'boolean';
  if (!Array.isArray(locations) || !locations.every(itemValid)) broken('Invalid getmatch locations');
}

/**
 * Adapter `extract`: response shape checks, active vacancy selection and pagination.
 * @param {any} data Parsed JSON body.
 * @returns {import('../processors/page-pipeline.mjs').PageExtraction & object}
 *   Items are the active vacancy offers; `ids` lists every vacancy id, inactive ones included.
 */
function extractGetmatch(data) {
  const meta = data?.meta;
  if (!Array.isArray(data?.offers) || !isValidMeta(meta)) broken('Unknown getmatch response shape');
  const items = [];
  const ids = [];
  for (const item of data.offers) {
    const isOffer = item && typeof item === 'object' && typeof item.offer_type === 'string';
    if (!isOffer) broken('Unknown getmatch offer shape');
    // Promotions are injected outside the ordinary vacancy page size.
    if (item.offer_type !== 'vacancy') continue;
    checkVacancyIdentity(item);
    ids.push(item.id);
    if (!item.is_active) continue;
    checkLocations(item);
    items.push(item);
  }
  const nextOffset = meta.offset + meta.limit;
  if (!Number.isSafeInteger(nextOffset)) broken('Invalid getmatch pagination');
  // LEGACY(parser-pipeline): continueOnEmpty keeps paginate going over a page that held only
  // promotions or inactive offers; paginate otherwise stops on the first empty page.
  const more = nextOffset < meta.total;
  return { items, ids, offset: meta.offset, nextOffset, hasNext: more, continueOnEmpty: more };
}

/**
 * @param {any} item Active vacancy offer.
 * @returns {string} Locations joined by " / ", each with its work format.
 */
function locationText(item) {
  return (item.location_items ?? [])
    .map(x => {
      const exclude = x.exclude ? 'Исключено: ' : '';
      const format = x.format ? ` (${FORMAT_LABELS[x.format] ?? clean(x.format)})` : '';
      return `${exclude}${clean(x.label)}${format}`;
    })
    .join(' / ');
}

/**
 * Adapter `values`: one active vacancy offer to makeJob input.
 * @param {any} item
 * @returns {object}
 */
function getmatchValues(item) {
  const declaredSalary = item.salary_hidden === false && item.salary_by_our_version === false;
  const salary = declaredSalary
    ? structuredSalary({ from: item.salary_display_from, to: item.salary_display_to, currency: item.salary_currency })
    : undefined;
  // The API currently also returns naive timestamps; do not guess their timezone.
  const hasZone = typeof item.published_at === 'string' && TIMEZONE_SUFFIX.test(item.published_at);
  // Listing metadata is sufficient for discovery. Do not copy full descriptions.
  return {
    title: item.position,
    url: jobUrl(item.url, 'getmatch'),
    company: item.incognito_publication ? '' : item.company?.name,
    location: locationText(item),
    date: hasZone ? item.published_at : undefined,
    salary,
    salaryText: declaredSalary ? item.salary_description : undefined,
  };
}

/**
 * Adapter `finish`: append the salary tax and total-compensation notes.
 * @param {object | null} job
 * @param {any} item The offer the job was built from.
 * @returns {object | null} The same job.
 */
function addSalaryNotes(job, item) {
  if (job?.salary) {
    if (['gross', 'net'].includes(item.salary_taxes)) job.note += `; salary taxes: ${item.salary_taxes}`;
    if (item.salary_is_total === true) job.note += '; salary includes total compensation';
  }
  return job;
}

const getmatchAdapter = {
  source: 'getmatch',
  noValid: 'getmatch offers contain no valid vacancies',
  extract: extractGetmatch,
  values: getmatchValues,
  finish: addSalaryNotes,
};

/**
 * Parse one getmatch API page.
 * @param {any} data Parsed JSON body.
 * @returns {{ jobs: object[], hasNext: boolean, ids: number[], offset: number,
 *   nextOffset: number, continueOnEmpty: boolean }}
 * @throws {SourceError} `broken-markup` for any unexpected shape.
 */
export function parseGetmatch(data) {
  return parsePage(getmatchAdapter, data);
}

/**
 * Query string of one page request: paging plus the configured experimental filters.
 * @param {{ per_page: number } & Record<string, any>} cfg
 * @param {number} page
 * @param {number} offset
 * @returns {URLSearchParams}
 */
function pageParams(cfg, page, offset) {
  const params = new URLSearchParams({ p: String(page), offset: String(offset), limit: String(cfg.per_page) });
  for (const key of ['sa', 'pa']) if (cfg[key] !== undefined) params.append(key, cfg[key]);
  for (const key of ['se', 'l']) for (const value of cfg[key] ?? []) params.append(key, value);
  return params;
}

/**
 * Fetch getmatch jobs, failing when the offset does not advance or ids repeat.
 * @param {{ max_pages: number, per_page: number } & Record<string, any>} cfg
 * @param {any} ctx Guarded plugin context.
 * @param {{ retries?: number }} [options] Passed to the request layer.
 * @returns {Promise<object[]>}
 */
export function fetchGetmatch(cfg, ctx, options) {
  let offset = 0;
  const seen = new Set();
  return paginate(
    'getmatch',
    [''],
    cfg.max_pages,
    async (_route, page) => {
      const url = new URL(API_URL);
      url.search = pageParams(cfg, page, offset).toString();
      try {
        const result = parseGetmatch(await request(ctx, url.href, 'json', options));
        const stuck =
          result.offset !== offset ||
          result.nextOffset <= offset ||
          (result.ids.length && result.ids.every(id => seen.has(id)));
        if (stuck) broken('getmatch pagination did not advance');
        result.ids.forEach(id => seen.add(id));
        offset = result.nextOffset;
        return result;
      } catch (error) {
        error.requestInfo = url.href;
        throw error;
      }
    },
    ctx,
  );
}
