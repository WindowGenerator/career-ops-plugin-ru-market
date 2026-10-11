// GeekJob provider: public HTML listing https://geekjob.ru/vacancies/.
//
// A listing page holds `collection-item avatar` cards inside `ul#serplist`.
// Page N is `/vacancies/N`. This module knows only that markup.
import { all, byClass, checkAccess, hasClass, hasNext, nodeText, parseHtml } from '../helpers/html.mjs';
import { parseSalary } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';

const LISTING_URL = 'https://geekjob.ru/vacancies/';
const NOTHING_FOUND_TEXT = /ничего не найден|вакансий нет/i;
const PUBLISHED_LABEL = /опубликован|размещен|размещён/i;

/**
 * Adapter `extract`: access check, card discovery and the pagination link.
 * @param {string} html
 * @param {{ url: string }} ctx Page URL, used to find the next-page link.
 * @returns {import('../processors/page-pipeline.mjs').PageExtraction}
 */
function extractGeekjob(html, { url }) {
  const root = parseHtml(html);
  checkAccess(root);
  const list = all(root, n => n.tag === 'ul' && n.attrs.id === 'serplist' && hasClass(n, 'serp-list'))[0];
  if (!list) throw new SourceError('broken-markup', 'GeekJob listing container absent');
  const cards = byClass(list, 'collection-item').filter(n => hasClass(n, 'avatar'));
  if (cards.length) return { items: cards, hasNext: hasNext(root, url) };
  const hasVacancyLinks = all(list, n => n.tag === 'a' && /\/vacancy\//.test(n.attrs.href ?? '')).length > 0;
  const hasUnknownText = nodeText(list) && !NOTHING_FOUND_TEXT.test(nodeText(list));
  if (hasVacancyLinks || hasUnknownText) throw new SourceError('broken-markup', 'Unknown GeekJob listing contents');
  return { items: [], hasNext: false };
}

/**
 * Adapter `values`: one card to makeJob input.
 * @param {object} card A `collection-item avatar` node.
 * @param {{ now: number }} ctx Clock for dates without a year.
 * @returns {object}
 */
function geekjobValues(card, { now }) {
  const link = byClass(card, 'title').find(n => n.tag === 'a');
  const salaryText = nodeText(byClass(card, 'salary')[0]);
  const time = all(card, n => n.tag === 'time')[0];
  // LEGACY(parser-pipeline): GeekJob listing timestamps are not explicitly publication dates.
  // Only an explicit publication label/attribute may become postedAt, so most cards have none.
  const isPublished = time?.attrs.itemprop === 'datePosted' || PUBLISHED_LABEL.test(nodeText(time));
  const infoLines = byClass(card, 'info')
    .map(n => nodeText(n, child => hasClass(child, 'salary')))
    .filter(Boolean);
  return {
    title: nodeText(link),
    url: link?.attrs.href,
    company: nodeText(byClass(card, 'company-name')[0]),
    location: [...new Set(infoLines)].join(' / '),
    description: nodeText(byClass(card, 'description')[0]),
    date: isPublished ? time?.attrs.datetime ?? nodeText(time) : '',
    now,
    salary: parseSalary(salaryText),
    salaryText,
  };
}

const geekjobAdapter = {
  source: 'geekjob',
  noValid: 'GeekJob cards contain no valid vacancies',
  extract: extractGeekjob,
  values: geekjobValues,
};

/**
 * Parse one GeekJob listing page.
 * @param {string} html
 * @param {string} [url] Page URL, for the next-page link.
 * @param {number} [now] Epoch ms, for dates without a year.
 * @returns {{ jobs: object[], hasNext: boolean }}
 * @throws {SourceError} `access` for challenge pages, `broken-markup` for unknown pages.
 */
export function parseGeekjob(html, url = LISTING_URL, now = Date.now()) {
  return parsePage(geekjobAdapter, html, { url, now });
}

/**
 * Fetch GeekJob jobs.
 * @param {{ max_pages: number }} cfg
 * @param {any} ctx Guarded plugin context.
 * @param {{ retries?: number }} [options] Passed to the request layer.
 * @returns {Promise<object[]>}
 */
export function fetchGeekjob(cfg, ctx, options) {
  return paginate('geekjob', [''], cfg.max_pages, async (_route, page) => {
    const url = new URL(`${LISTING_URL}${page > 1 ? page : ''}`);
    return parseGeekjob(await request(ctx, url.href, 'text', options), url.href);
  }, ctx);
}
