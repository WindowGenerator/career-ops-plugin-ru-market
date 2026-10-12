// Habr Career provider: public HTML listing https://career.habr.com/vacancies.
//
// A listing page holds `vacancy-card` blocks. This module knows only that
// markup; fetching, retry and deduplication come from the shared modules.
import {
  all,
  byClass,
  checkAccess,
  hasNext,
  nodeText,
  parseHtml,
} from '../helpers/html.mjs';
import { parseSalary } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';
import { SOURCE_REGISTRY } from '../sources.mjs';

const SOURCE_ID = SOURCE_REGISTRY['habr-career'].id;
const LISTING_URL = 'https://career.habr.com/vacancies';
const EMPTY_PAGE_TEXT = /ваканс|ничего не найден/i;
const SENIORITY_CHIP = /^(?:Intern|Junior|Middle|Senior|Lead|Principal)$/i;
const UPDATED_DATE_TEXT = /обнов|updated/i;

/**
 * Adapter `extract`: access check, card discovery and the pagination link.
 * @param {string} html
 * @param {{ url: string }} ctx Page URL, used to find the next-page link.
 * @returns {import('../processors/page-pipeline.mjs').PageExtraction}
 */
function extractHabr(html, { url }) {
  const root = parseHtml(html);
  checkAccess(root);
  const cards = byClass(root, 'vacancy-card');
  if (cards.length) return { items: cards, hasNext: hasNext(root, url) };
  const confirmedEmpty =
    byClass(root, 'no-content').some(n => EMPTY_PAGE_TEXT.test(nodeText(n))) ||
    byClass(root, 'vacancies-empty').length > 0;
  if (!confirmedEmpty)
    throw new SourceError(
      'broken-markup',
      'Habr vacancy cards/empty marker absent',
    );
  return { items: [], hasNext: false };
}

/**
 * @param {object} card A `vacancy-card` node.
 * @returns {string} Date text for makeJob; empty when the card only says "updated".
 */
function cardDate(card) {
  const dateNode = byClass(card, 'vacancy-card__date')[0];
  const time = all(dateNode, n => n.tag === 'time')[0];
  // LEGACY(parser-pipeline): Russian/English labels are hard-coded. A card whose date text says
  // "updated" carries no publication date, so it is dropped instead of guessed.
  if (UPDATED_DATE_TEXT.test(nodeText(dateNode))) return '';
  return time?.attrs.datetime ?? nodeText(time);
}

/**
 * @param {object} card A `vacancy-card` node.
 * @returns {string} Location chips joined by " / ".
 */
function cardLocation(card) {
  // LEGACY(parser-pipeline): seniority chips are filtered by hard-coded English labels; they are
  // not location, and Habr gives no other marker to tell the two kinds of chip apart.
  const chips = byClass(card, 'chip-with-icon__text').filter(
    chip => !SENIORITY_CHIP.test(nodeText(chip)),
  );
  return [...new Set(chips.map(n => nodeText(n)))].join(' / ');
}

/**
 * Adapter `values`: one card to makeJob input.
 * @param {object} card A `vacancy-card` node.
 * @returns {object}
 */
function habrValues(card) {
  const link = byClass(card, 'vacancy-card__title-link')[0];
  const salaryNode = byClass(card, 'vacancy-card__salary')[0];
  const salaryText = nodeText(salaryNode);
  const predictedSalary = byClass(salaryNode, 'predicted-salary').length > 0;
  const companyNode = byClass(card, 'vacancy-card__company')[0];
  const companyLink = all(companyNode, n => n.tag === 'a')[0];
  return {
    title: nodeText(link),
    url: link?.attrs.href,
    company: nodeText(companyLink ?? companyNode),
    location: cardLocation(card),
    description: nodeText(byClass(card, 'vacancy-card__description')[0]),
    date: cardDate(card),
    salary: predictedSalary ? undefined : parseSalary(salaryText),
    salaryText: predictedSalary ? undefined : salaryText,
  };
}

const habrAdapter = {
  source: SOURCE_ID,
  noValid: 'Habr cards contain no valid vacancies',
  extract: extractHabr,
  values: habrValues,
};

/**
 * Parse one Habr Career listing page.
 * @param {string} html
 * @param {string} url Page URL, for the next-page link.
 * @returns {{ jobs: object[], hasNext: boolean }}
 * @throws {SourceError} `access` for challenge pages, `broken-markup` for unknown pages.
 */
export function parseHabr(html, url) {
  return parsePage(habrAdapter, html, { url });
}

/**
 * Fetch Habr Career jobs for every configured category.
 * @param {{ categories: string[], max_pages: number, remote: boolean }} cfg
 * @param {any} ctx Guarded plugin context.
 * @param {{ retries?: number }} [options] Passed to the request layer.
 * @returns {Promise<object[]>}
 */
export function fetchHabr(cfg, ctx, options) {
  return paginate(
    SOURCE_ID,
    cfg.categories,
    cfg.max_pages,
    async (category, page) => {
      const path = `${category ? `/${category}` : ''}${cfg.remote ? '/remote' : ''}`;
      const url = new URL(`${LISTING_URL}${path}`);
      if (page > 1) url.searchParams.set('page', String(page));
      return parseHabr(await request(ctx, url.href, 'text', options), url.href);
    },
    ctx,
  );
}
