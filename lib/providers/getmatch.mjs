import { clean, jobUrl, structuredSalary } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';

const broken = message => { throw new SourceError('broken-markup', message); };
const formats = { office: 'Офис', hybrid: 'Гибрид', remote: 'Удалённо',
  relocation_company: 'Релокация за счёт компании', relocation_candidate: 'Релокация за свой счёт' };

function extractGetmatch(data) {
  const meta = data?.meta;
  if (!Array.isArray(data?.offers) || !meta
    || !Number.isSafeInteger(meta.total) || meta.total < 0
    || !Number.isSafeInteger(meta.offset) || meta.offset < 0
    || !Number.isSafeInteger(meta.limit) || meta.limit < 1) broken('Unknown getmatch response shape');
  const items = [];
  const ids = [];
  for (const item of data.offers) {
    if (!item || typeof item !== 'object' || typeof item.offer_type !== 'string') broken('Unknown getmatch offer shape');
    // Promotions are injected outside the ordinary vacancy page size.
    if (item.offer_type !== 'vacancy') continue;
    const url = jobUrl(item.url, 'getmatch');
    if (!Number.isSafeInteger(item.id) || item.id < 1 || typeof item.is_active !== 'boolean'
      || !clean(item.position) || !url || Number(new URL(url).pathname.match(/^\/vacancies\/(\d+)-/)[1]) !== item.id) {
      broken('Invalid getmatch vacancy');
    }
    ids.push(item.id);
    if (!item.is_active) continue;
    if (item.location_items != null && (!Array.isArray(item.location_items)
      || item.location_items.some(x => !x || typeof x.label !== 'string'
        || typeof x.format !== 'string' || typeof x.exclude !== 'boolean'))) broken('Invalid getmatch locations');
    items.push(item);
  }
  const nextOffset = meta.offset + meta.limit;
  if (!Number.isSafeInteger(nextOffset)) broken('Invalid getmatch pagination');
  // LEGACY(parser-pipeline): continueOnEmpty keeps paginate going over a page that held only
  // promotions or inactive offers; paginate otherwise stops on the first empty page.
  return { items, ids, offset: meta.offset, nextOffset,
    hasNext: nextOffset < meta.total, continueOnEmpty: nextOffset < meta.total };
}

function getmatchValues(item) {
  const location = (item.location_items ?? []).map(x =>
    `${x.exclude ? 'Исключено: ' : ''}${clean(x.label)}${x.format ? ` (${formats[x.format] ?? clean(x.format)})` : ''}`).join(' / ');
  const declaredSalary = item.salary_hidden === false && item.salary_by_our_version === false;
  const salary = declaredSalary ? structuredSalary({ from: item.salary_display_from,
    to: item.salary_display_to, currency: item.salary_currency }) : undefined;
  // The API currently also returns naive timestamps; do not guess their timezone.
  const date = typeof item.published_at === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(item.published_at)
    ? item.published_at : undefined;
  // Listing metadata is sufficient for discovery. Do not copy full descriptions.
  return { title: item.position, url: jobUrl(item.url, 'getmatch'),
    company: item.incognito_publication ? '' : item.company?.name, location, date, salary,
    salaryText: declaredSalary ? item.salary_description : undefined };
}

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

export function parseGetmatch(data) {
  return parsePage(getmatchAdapter, data);
}

export function fetchGetmatch(cfg, ctx, options) {
  let offset = 0;
  const seen = new Set();
  return paginate('getmatch', [''], cfg.max_pages, async (_route, page) => {
    const url = new URL('https://getmatch.ru/api/offers');
    const params = new URLSearchParams({ p: String(page), offset: String(offset), limit: String(cfg.per_page) });
    for (const key of ['sa', 'pa']) if (cfg[key] !== undefined) params.append(key, cfg[key]);
    for (const key of ['se', 'l']) for (const value of cfg[key] ?? []) params.append(key, value);
    url.search = params.toString();
    try {
      const result = parseGetmatch(await request(ctx, url.href, 'json', options));
      if (result.offset !== offset || result.nextOffset <= offset
        || (result.ids.length && result.ids.every(id => seen.has(id)))) broken('getmatch pagination did not advance');
      result.ids.forEach(id => seen.add(id));
      offset = result.nextOffset;
      return result;
    } catch (error) {
      error.requestInfo = url.href;
      throw error;
    }
  }, ctx);
}
