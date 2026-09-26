import { all, byClass, checkAccess, hasClass, hasNext, nodeText, parseHtml } from './html.mjs';
import { makeJob, parseSalary } from './normalize.mjs';
import { SourceError } from './errors.mjs';
import { localDedup } from './dedup.mjs';
import { request } from './http.mjs';
import { paginate } from './paginate.mjs';

export function parseGeekjob(html, url = 'https://geekjob.ru/vacancies/', now = Date.now()) {
  const root = parseHtml(html);
  checkAccess(root);
  const list = all(root, n => n.tag === 'ul' && n.attrs.id === 'serplist' && hasClass(n, 'serp-list'))[0];
  if (!list) throw new SourceError('broken-markup', 'GeekJob listing container absent');
  const cards = byClass(list, 'collection-item').filter(n => hasClass(n, 'avatar'));
  if (!cards.length) {
    if (all(list, n => n.tag === 'a' && /\/vacancy\//.test(n.attrs.href ?? '')).length
      || nodeText(list) && !/ничего не найден|вакансий нет/i.test(nodeText(list))) {
      throw new SourceError('broken-markup', 'Unknown GeekJob listing contents');
    }
    return { jobs: [], hasNext: false };
  }
  const jobs = cards.map(card => {
    const link = byClass(card, 'title').find(n => n.tag === 'a');
    const salaryText = nodeText(byClass(card, 'salary')[0]);
    const time = all(card, n => n.tag === 'time')[0];
    // GeekJob listing timestamps are not explicitly publication dates. Only
    // an explicit publication label/attribute may become postedAt.
    const isPublished = time?.attrs.itemprop === 'datePosted' || /опубликован|размещен|размещён/i.test(nodeText(time));
    return makeJob('geekjob', {
      title: nodeText(link), url: link?.attrs.href, company: nodeText(byClass(card, 'company-name')[0]),
      location: [...new Set(byClass(card, 'info').map(n => nodeText(n, child => hasClass(child, 'salary'))).filter(Boolean))].join(' / '),
      description: nodeText(byClass(card, 'description')[0]),
      date: isPublished ? time?.attrs.datetime ?? nodeText(time) : '', now,
      salary: parseSalary(salaryText), salaryText,
    });
  }).filter(Boolean);
  if (!jobs.length) throw new SourceError('broken-markup', 'GeekJob cards contain no valid vacancies');
  return { jobs: localDedup(jobs), hasNext: hasNext(root, url) };
}

export function fetchGeekjob(cfg, ctx, options) {
  return paginate('geekjob', [''], cfg.max_pages, async (_route, page) => {
    const url = new URL(`https://geekjob.ru/vacancies/${page > 1 ? page : ''}`);
    return parseGeekjob(await request(ctx, url.href, 'text', options), url.href);
  }, ctx);
}
