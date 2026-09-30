import { makeJob, structuredSalary } from './normalize.mjs';
import { SourceError } from './errors.mjs';
import { request } from './http.mjs';
import { paginate } from './paginate.mjs';
import { localDedup } from './dedup.mjs';

export function parseTrudvsem(data, offset = 0) {
  if (data?.status !== undefined && String(data.status) !== '200') throw new SourceError('access', 'Работа России API error');
  const rows = data?.results?.vacancies;
  const total = Number(data?.meta?.total);
  if (data?.status === undefined || !Array.isArray(rows) || !Number.isSafeInteger(total) || total < 0) {
    throw new SourceError('broken-markup', 'Unknown Работа России response shape');
  }
  const jobs = rows.map(row => {
    const item = row?.vacancy;
    if (!item || typeof item !== 'object') return null;
    const currency = /руб|rub|rur/i.test(item.currency ?? '') ? 'RUB' : undefined;
    const from = Number(item.salary_min) || undefined;
    const to = Number(item.salary_max) || undefined;
    const salary = currency ? structuredSalary({ from, to, currency }) : undefined;
    const address = item.addresses?.address?.[0]?.location;
    return makeJob('trudvsem', {
      title: item['job-name'],
      url: item.vac_url,
      company: item.company?.name,
      location: address || item.region?.name,
      description: [item.duty, item.requirements, item.qualification].filter(x => typeof x === 'string').join(' '),
      date: item['creation-date'],
      salary,
      salaryText: salary ? [from ? `from ${from}` : '', to ? `to ${to}` : '', currency].filter(Boolean).join(' ') : undefined,
    });
  }).filter(Boolean);
  if (rows.length && !jobs.length) throw new SourceError('broken-markup', 'Работа России items contain no valid vacancies');
  return { jobs: localDedup(jobs), hasNext: rows.length > 0 && offset + rows.length < total };
}

export function fetchTrudvsem(cfg, ctx, options) {
  return paginate('trudvsem', cfg.queries, cfg.max_pages, async (query, page) => {
    const url = new URL('https://opendata.trudvsem.ru/api/v1/vacancies');
    if (query) url.searchParams.set('text', query);
    url.searchParams.set('limit', String(cfg.per_page));
    url.searchParams.set('offset', String((page - 1) * cfg.per_page));
    return parseTrudvsem(await request(ctx, url.href, 'json', options), (page - 1) * cfg.per_page);
  }, ctx);
}
