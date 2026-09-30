import { all, byClass, checkAccess, hasNext, nodeText, parseHtml } from './html.mjs';
import { makeJob, parseSalary } from './normalize.mjs';
import { SourceError } from './errors.mjs';
import { localDedup } from './dedup.mjs';
import { request } from './http.mjs';
import { paginate } from './paginate.mjs';

export function parseHabr(html, url = 'https://career.habr.com/vacancies') {
  const root = parseHtml(html);
  checkAccess(root);
  const cards = byClass(root, 'vacancy-card');
  if (!cards.length) {
    const empty = byClass(root, 'no-content').some(n => /ваканс|ничего не найден/i.test(nodeText(n)))
      || byClass(root, 'vacancies-empty').length > 0;
    if (!empty) throw new SourceError('broken-markup', 'Habr vacancy cards/empty marker absent');
    return { jobs: [], hasNext: false };
  }
  const jobs = cards.map(card => {
    const link = byClass(card, 'vacancy-card__title-link')[0];
    const salaryNode = byClass(card, 'vacancy-card__salary')[0];
    const salaryText = nodeText(salaryNode);
    const predictedSalary = byClass(salaryNode, 'predicted-salary').length > 0;
    const companyNode = byClass(card, 'vacancy-card__company')[0];
    const companyLink = all(companyNode, n => n.tag === 'a')[0];
    const dateNode = byClass(card, 'vacancy-card__date')[0];
    const time = all(dateNode, n => n.tag === 'time')[0];
    const date = /обнов|updated/i.test(nodeText(dateNode)) ? '' : time?.attrs.datetime ?? nodeText(time);
    const chips = byClass(card, 'chip-with-icon__text').filter(chip => !/^(?:Intern|Junior|Middle|Senior|Lead|Principal)$/i.test(nodeText(chip)));
    return makeJob('habr-career', {
      title: nodeText(link), url: link?.attrs.href,
      company: nodeText(companyLink ?? companyNode),
      location: [...new Set(chips.map(n => nodeText(n)))].join(' / '),
      description: nodeText(byClass(card, 'vacancy-card__description')[0]), date,
      salary: predictedSalary ? undefined : parseSalary(salaryText),
      salaryText: predictedSalary ? undefined : salaryText,
    });
  }).filter(Boolean);
  if (!jobs.length) throw new SourceError('broken-markup', 'Habr cards contain no valid vacancies');
  return { jobs: localDedup(jobs), hasNext: hasNext(root, url) };
}

export function fetchHabr(cfg, ctx, options) {
  return paginate('habr-career', cfg.categories, cfg.max_pages, async (category, page) => {
    const url = new URL(`https://career.habr.com/vacancies${category ? `/${category}` : ''}${cfg.remote ? '/remote' : ''}`);
    if (page > 1) url.searchParams.set('page', String(page));
    return parseHabr(await request(ctx, url.href, 'text', options), url.href);
  }, ctx);
}
