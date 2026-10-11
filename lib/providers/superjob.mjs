// SuperJob provider: JSON API https://api.superjob.ru/2.0/vacancies/.
//
// Needs an application key (SUPERJOB_API_KEY), sent by the transport layer.
// A page is `{ objects: [...], more: boolean }`; this module maps one object
// to a job and nothing else.
import { structuredSalary } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';

const API_URL = 'https://api.superjob.ru/2.0/vacancies/';
const CURRENCIES = {
  rub: 'RUB',
  rur: 'RUB',
  usd: 'USD',
  eur: 'EUR',
  kzt: 'KZT',
  byn: 'BYN',
};
const MAX_DATE_MS = 8_640_000_000_000;

/**
 * Adapter `extract`: API error and response shape checks.
 * @param {any} data Parsed JSON body.
 * @returns {import('../processors/page-pipeline.mjs').PageExtraction}
 */
function extractSuperjob(data) {
  if (data?.error) throw new SourceError('access', 'SuperJob API error');
  if (!data || !Array.isArray(data.objects) || typeof data.more !== 'boolean') {
    throw new SourceError('broken-markup', 'Unknown SuperJob response shape');
  }
  return { items: data.objects, hasNext: data.more };
}

/**
 * @param {unknown} seconds `date_published`, a Unix timestamp in seconds.
 * @returns {string | undefined} ISO timestamp; undefined when not a sane timestamp.
 */
function publishedAt(seconds) {
  const valid =
    Number.isSafeInteger(seconds) && seconds > 0 && seconds < MAX_DATE_MS;
  return valid ? new Date(seconds * 1000).toISOString() : undefined;
}

/**
 * Adapter `values`: one API object to makeJob input.
 * @param {any} item
 * @returns {object | null} Null for items that are not objects.
 */
function superjobValues(item) {
  if (!item || typeof item !== 'object') return null;
  const currency = CURRENCIES[String(item.currency ?? '').toLowerCase()];
  const from = Number(item.payment_from) || undefined;
  const to = Number(item.payment_to) || undefined;
  const salary =
    !item.agreement && currency
      ? structuredSalary({ from, to, currency })
      : undefined;
  const catalogues = Array.isArray(item.catalogues)
    ? item.catalogues.map(x => x?.title)
    : [];
  return {
    title: item.profession,
    url: item.link,
    company: item.firm_name,
    location: [item.town?.title, item.place_of_work?.title]
      .filter(Boolean)
      .join(' / '),
    description: [item.work, item.candidat, item.compensation]
      .filter(x => typeof x === 'string')
      .join(' '),
    date: publishedAt(item.date_published),
    salary,
    employment: { rawLabels: [item.type_of_work?.title] },
    professional_role: { rawLabels: catalogues },
    // LEGACY(parser-pipeline): salaryText is rebuilt from the parsed amounts; the same expression is
    // copied in trudvsem.mjs. The API has no display string, so the copies are left as they are.
    salaryText: salary
      ? [from ? `from ${from}` : '', to ? `to ${to}` : '', currency]
          .filter(Boolean)
          .join(' ')
      : undefined,
  };
}

const superjobAdapter = {
  source: 'superjob',
  noValid: 'SuperJob items contain no valid vacancies',
  extract: extractSuperjob,
  values: superjobValues,
};

/**
 * Parse one SuperJob API page.
 * @param {any} data Parsed JSON body.
 * @returns {{ jobs: object[], hasNext: boolean }}
 * @throws {SourceError} `access` for API errors, `broken-markup` for unknown shapes.
 */
export function parseSuperjob(data) {
  return parsePage(superjobAdapter, data);
}

/**
 * Fetch SuperJob jobs for every configured query.
 * @param {{ queries: string[], max_pages: number, per_page: number }} cfg
 * @param {any} ctx Guarded plugin context.
 * @param {{ retries?: number }} [options] Passed to the request layer.
 * @returns {Promise<object[]>}
 */
export function fetchSuperjob(cfg, ctx, options) {
  return paginate(
    'superjob',
    cfg.queries,
    cfg.max_pages,
    async (query, page) => {
      const url = new URL(API_URL);
      if (query) url.searchParams.set('keyword', query);
      url.searchParams.set('page', String(page - 1));
      url.searchParams.set('count', String(cfg.per_page));
      return parseSuperjob(await request(ctx, url.href, 'json', options));
    },
    ctx,
  );
}
