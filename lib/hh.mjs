import { makeJob, plainText, structuredSalary } from './normalize.mjs';
import { SourceError } from './errors.mjs';
import { request } from './http.mjs';
import { paginate } from './paginate.mjs';
import { localDedup } from './dedup.mjs';

export function parseHh(data) {
  if (data?.errors?.some?.(e => /captcha|forbidden|auth/i.test(`${e.type} ${e.value}`))) throw new SourceError('access', 'HH access error');
  if (!data || !Array.isArray(data.items) || !Number.isInteger(data.pages) || data.pages < 0
    || !Number.isInteger(data.page) || data.page < 0) throw new SourceError('broken-markup', 'Unknown HH response shape');
  const jobs = data.items.map(item => {
    if (!item || typeof item !== 'object') return null;
    const rawSalary = item.salary_range ?? item.salary;
    const salary = structuredSalary(rawSalary);
    const salaryText = rawSalary ? [rawSalary.from != null ? `from ${rawSalary.from}` : '', rawSalary.to != null ? `to ${rawSalary.to}` : '', rawSalary.currency,
      rawSalary.gross === true ? 'gross' : rawSalary.gross === false ? 'net' : '', rawSalary.mode?.name, rawSalary.frequency?.name].filter(Boolean).join(' ') : '';
    return makeJob('hh', {
      title: item.name,
      url: item.alternate_url ?? (typeof item.id === 'string' && /^\d+$/.test(item.id) ? `https://hh.ru/vacancy/${item.id}` : ''),
      company: item.employer?.name,
      location: [...new Set([item.area?.name, item.address?.city, item.schedule?.name, ...(Array.isArray(item.work_format) ? item.work_format.map(f => f.name) : [])].filter(Boolean))].join(' / '),
      locationText: item.area?.name ?? item.address?.city ?? '',
      locations: [...new Set([item.area?.name, item.address?.city].filter(Boolean))],
      workArrangement: (item.work_format ?? []).some(f => f.id === 'HYBRID') ? 'hybrid' : item.schedule?.id === 'remote' || (item.work_format ?? []).some(f => f.id === 'REMOTE') ? 'remote' : 'unknown',
      description: plainText(item.description || [item.snippet?.requirement, item.snippet?.responsibility].filter(Boolean).join(' ')),
      date: item.published_at, salary, salaryText,
      salaryPeriod: /MONTH|месяц/i.test(rawSalary?.mode?.id ?? rawSalary?.mode?.name ?? '') ? 'month' : 'unknown',
      taxBasis: rawSalary?.gross === true ? 'gross' : rawSalary?.gross === false ? 'net' : 'unknown',
    });
  }).filter(Boolean);
  if (data.items.length && !jobs.length) throw new SourceError('broken-markup', 'HH items contain no valid vacancies');
  return { jobs: localDedup(jobs), hasNext: data.page + 1 < data.pages };
}

export function fetchHh(cfg, ctx, options) {
  return paginate('hh', cfg.queries, cfg.max_pages, async (query, page) => {
    const url = new URL('https://api.hh.ru/vacancies');
    for (const [key, value] of Object.entries({ text: query, page: page - 1, per_page: cfg.per_page, host: cfg.host, locale: cfg.locale,
      area: cfg.area, schedule: cfg.schedule, period: cfg.period, order_by: 'publication_time' })) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    return parseHh(await request(ctx, url.href, 'json', options));
  }, ctx);
}
