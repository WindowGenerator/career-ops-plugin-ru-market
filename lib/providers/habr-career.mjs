import { all, byClass, checkAccess, hasNext, nodeText, parseHtml } from '../helpers/html.mjs';
import { parseSalary } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';

function extractHabr(html, { url }) {
  const root = parseHtml(html);
  checkAccess(root);
  const cards = byClass(root, 'vacancy-card');
  if (!cards.length) {
    const empty = byClass(root, 'no-content').some(n => /ваканс|ничего не найден/i.test(nodeText(n)))
      || byClass(root, 'vacancies-empty').length > 0;
    if (!empty) throw new SourceError('broken-markup', 'Habr vacancy cards/empty marker absent');
    return { items: [], hasNext: false };
  }
  return { items: cards, hasNext: hasNext(root, url) };
}

function habrValues(card) {
  const link = byClass(card, 'vacancy-card__title-link')[0];
  const salaryNode = byClass(card, 'vacancy-card__salary')[0];
  const salaryText = nodeText(salaryNode);
  const predictedSalary = byClass(salaryNode, 'predicted-salary').length > 0;
  const companyNode = byClass(card, 'vacancy-card__company')[0];
  const companyLink = all(companyNode, n => n.tag === 'a')[0];
  const dateNode = byClass(card, 'vacancy-card__date')[0];
  const time = all(dateNode, n => n.tag === 'time')[0];
  // LEGACY(parser-pipeline): Russian/English labels are hard-coded. A card whose date text says
  // "updated" carries no publication date, so it is dropped instead of guessed.
  const date = /обнов|updated/i.test(nodeText(dateNode)) ? '' : time?.attrs.datetime ?? nodeText(time);
  // LEGACY(parser-pipeline): seniority chips are filtered by hard-coded English labels; they are
  // not location, and Habr gives no other marker to tell the two kinds of chip apart.
  const chips = byClass(card, 'chip-with-icon__text').filter(chip => !/^(?:Intern|Junior|Middle|Senior|Lead|Principal)$/i.test(nodeText(chip)));
  return {
    title: nodeText(link), url: link?.attrs.href,
    company: nodeText(companyLink ?? companyNode),
    location: [...new Set(chips.map(n => nodeText(n)))].join(' / '),
    description: nodeText(byClass(card, 'vacancy-card__description')[0]), date,
    salary: predictedSalary ? undefined : parseSalary(salaryText),
    salaryText: predictedSalary ? undefined : salaryText,
  };
}

const habrAdapter = {
  source: 'habr-career',
  noValid: 'Habr cards contain no valid vacancies',
  extract: extractHabr,
  values: habrValues,
};

export function parseHabr(html, url = 'https://career.habr.com/vacancies') {
  return parsePage(habrAdapter, html, { url });
}

export function fetchHabr(cfg, ctx, options) {
  return paginate('habr-career', cfg.categories, cfg.max_pages, async (category, page) => {
    const url = new URL(`https://career.habr.com/vacancies${category ? `/${category}` : ''}${cfg.remote ? '/remote' : ''}`);
    if (page > 1) url.searchParams.set('page', String(page));
    return parseHabr(await request(ctx, url.href, 'text', options), url.href);
  }, ctx);
}
