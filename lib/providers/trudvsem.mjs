// Trudvsem ("Работа России") provider: open-data API
// https://opendata.trudvsem.ru/api/v1/vacancies.
//
// A page is `{ status, meta: { total }, results: { vacancies: [{ vacancy }] } }`.
// Pagination is offset-based; this module maps one record to a job.
import { structuredSalary } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';

const API_URL = 'https://opendata.trudvsem.ru/api/v1/vacancies';
const RUBLES = /руб|rub|rur/i;

/**
 * @param {number} status HTTP-like status from the API body.
 * @returns {string} Failure category.
 */
function categoryOfApiStatus(status) {
  if (status >= 500) return 'server';
  if (status === 429) return 'rate-limited';
  if (status === 401 || status === 403) return 'access';
  return 'http';
}

/**
 * Adapter `extract`: API status and response shape checks, plus the offset pagination rule.
 * @param {any} data Parsed JSON body.
 * @param {{ pageIndex: number, pageSize: number }} ctx
 * @returns {import('../processors/page-pipeline.mjs').PageExtraction}
 */
function extractTrudvsem(data, { pageIndex, pageSize }) {
  if (data?.status !== undefined && String(data.status) !== '200') {
    const status = Number(data.status);
    const error = new SourceError(categoryOfApiStatus(status), 'Работа России API error');
    if (Number.isInteger(status)) error.status = status;
    throw error;
  }
  const rows = data?.results?.vacancies;
  const total = Number(data?.meta?.total);
  if (data?.status === undefined || !Array.isArray(rows) || !Number.isSafeInteger(total) || total < 0) {
    throw new SourceError('broken-markup', 'Unknown Работа России response shape');
  }
  return { items: rows, hasNext: rows.length > 0 && pageIndex * pageSize + rows.length < total };
}

/**
 * Adapter `values`: one record to makeJob input.
 * @param {any} row `{ vacancy }` record.
 * @returns {object | null} Null for rows without a vacancy object.
 */
function trudvsemValues(row) {
  const item = row?.vacancy;
  if (!item || typeof item !== 'object') return null;
  const currency = RUBLES.test(item.currency ?? '') ? 'RUB' : undefined;
  const from = Number(item.salary_min) || undefined;
  const to = Number(item.salary_max) || undefined;
  const salary = currency ? structuredSalary({ from, to, currency }) : undefined;
  const address = item.addresses?.address?.[0]?.location;
  return {
    title: item['job-name'],
    url: item.vac_url,
    company: item.company?.name,
    location: address || item.region?.name,
    description: [item.duty, item.requirements, item.qualification].filter(x => typeof x === 'string').join(' '),
    date: item['creation-date'],
    salary,
    employment: { rawLabels: [item.employment] },
    professional_role: { rawLabels: [item.category?.specialisation] },
    // LEGACY(parser-pipeline): copy of the salaryText expression in superjob.mjs; left duplicated.
    salaryText: salary
      ? [from ? `from ${from}` : '', to ? `to ${to}` : '', currency].filter(Boolean).join(' ')
      : undefined,
  };
}

const trudvsemAdapter = {
  source: 'trudvsem',
  noValid: 'Работа России items contain no valid vacancies',
  extract: extractTrudvsem,
  values: trudvsemValues,
};

/**
 * Parse one Trudvsem API page.
 * @param {any} data Parsed JSON body.
 * @param {number} [pageIndex] Zero-based offset page of this response.
 * @param {number} [pageSize] Requested `limit`.
 * @returns {{ jobs: object[], hasNext: boolean }}
 * @throws {SourceError} With a category derived from the API status, or `broken-markup`.
 */
export function parseTrudvsem(data, pageIndex = 0, pageSize = 100) {
  return parsePage(trudvsemAdapter, data, { pageIndex, pageSize });
}

/**
 * Fetch Trudvsem jobs for every configured query.
 * @param {{ queries: string[], max_pages: number, per_page: number }} cfg
 * @param {any} ctx Guarded plugin context.
 * @param {{ retries?: number }} [options] Passed to the request layer.
 * @returns {Promise<object[]>}
 */
export function fetchTrudvsem(cfg, ctx, options) {
  return paginate(
    'trudvsem',
    cfg.queries,
    cfg.max_pages,
    async (query, page) => {
      const url = new URL(API_URL);
      if (query) url.searchParams.set('text', query);
      url.searchParams.set('limit', String(cfg.per_page));
      url.searchParams.set('offset', String(page - 1));
      try {
        return parseTrudvsem(await request(ctx, url.href, 'json', options), page - 1, cfg.per_page);
      } catch (error) {
        // Include only the listing endpoint and pagination; text may contain personal data.
        error.requestInfo = `${API_URL}?limit=${cfg.per_page}&offset=${page - 1}`;
        throw error;
      }
    },
    ctx,
  );
}
