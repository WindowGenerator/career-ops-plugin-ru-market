import { makeJob, structuredSalary } from './normalize.mjs';
import { SourceError } from './errors.mjs';
import { request } from './http.mjs';
import { paginate } from './paginate.mjs';
import { localDedup } from './dedup.mjs';

const currencies = { rub: 'RUB', rur: 'RUB', usd: 'USD', eur: 'EUR', kzt: 'KZT', byn: 'BYN' };

export function parseSuperjob(data) {
  if (data?.error) throw new SourceError('access', 'SuperJob API error');
  if (!data || !Array.isArray(data.objects) || typeof data.more !== 'boolean') {
    throw new SourceError('broken-markup', 'Unknown SuperJob response shape');
  }
  const jobs = data.objects.map(item => {
    if (!item || typeof item !== 'object') return null;
    const currency = currencies[String(item.currency ?? '').toLowerCase()];
    const from = Number(item.payment_from) || undefined;
    const to = Number(item.payment_to) || undefined;
    const salary = !item.agreement && currency ? structuredSalary({ from, to, currency }) : undefined;
    return makeJob('superjob', {
      title: item.profession,
      url: item.link,
      company: item.firm_name,
      location: [item.town?.title, item.place_of_work?.title].filter(Boolean).join(' / '),
      description: [item.work, item.candidat, item.compensation].filter(x => typeof x === 'string').join(' '),
      date: Number.isSafeInteger(item.date_published) && item.date_published > 0 && item.date_published < 8_640_000_000_000
        ? new Date(item.date_published * 1000).toISOString() : undefined,
      salary,
      employment: { rawLabels: [item.type_of_work?.title] },
      professional_role: { rawLabels: Array.isArray(item.catalogues) ? item.catalogues.map(x => x?.title) : [] },
      salaryText: salary ? [from ? `from ${from}` : '', to ? `to ${to}` : '', currency].filter(Boolean).join(' ') : undefined,
    });
  }).filter(Boolean);
  if (data.objects.length && !jobs.length) throw new SourceError('broken-markup', 'SuperJob items contain no valid vacancies');
  return { jobs: localDedup(jobs), hasNext: data.more };
}

export function fetchSuperjob(cfg, ctx, options) {
  return paginate('superjob', cfg.queries, cfg.max_pages, async (query, page) => {
    const url = new URL('https://api.superjob.ru/2.0/vacancies/');
    if (query) url.searchParams.set('keyword', query);
    url.searchParams.set('page', String(page - 1));
    url.searchParams.set('count', String(cfg.per_page));
    return parseSuperjob(await request(ctx, url.href, 'json', options));
  }, ctx);
}
