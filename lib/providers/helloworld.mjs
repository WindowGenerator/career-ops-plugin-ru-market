// HelloWorld.rs provider: public Serbian HTML listing
// https://www.helloworld.rs/oglasi-za-posao.
//
// A page holds job cards inside `__search-results`. Pagination follows the
// `rel="next"` link, which is validated strictly so a changed query or a
// non-advancing page fails loudly instead of looping.
import {
  all,
  byClass,
  checkAccess,
  hasClass,
  nodeText,
  parseHtml,
} from '../helpers/html.mjs';
import { clean } from '../processors/normalize.mjs';
import { normalizeCompensation } from '../processors/compensation.mjs';
import { SourceError } from '../errors.mjs';
import { request } from '../transport/http.mjs';
import { paginate } from '../processors/paginate.mjs';
import { parsePage } from '../processors/page-pipeline.mjs';

const ORIGIN = 'https://www.helloworld.rs';
const LISTING_PATH = '/oglasi-za-posao';
const PAGE_SIZE = 30;
const EMPTY_RESULTS_HEADING = /\(0 oglasa\)/;
const EMPTY_RESULTS_TEXT =
  /Trenutno nema oglasa po traženim kriterijumima pretrage\./;
const NON_EMPTY_HEADING = /\([1-9]\d* oglasa?\)/;
const REMOTE_WORDS = /Rad od kuće|\bRemote\b/i;
const HYBRID_WORD = /\bHibrid\b/i;
const SENIORITY_LEVELS = {
  junior: 'entry',
  intermediate: 'mid',
  senior: 'senior',
};
const ALLOWED_NEXT_PARAMS = ['q', 'disable_saved_search'];

/**
 * @param {string} message
 * @returns {never}
 */
function broken(message) {
  // LEGACY(parser-pipeline): `broken` is redefined in getmatch.mjs; left duplicated.
  throw new SourceError('broken-markup', message);
}

const titleLink = n => n.tag === 'a' && hasClass(n, '__ga4_job_title');

/**
 * Parse a Serbian salary such as "2.600,00 - 3.200,00 EUR (net)".
 * @param {unknown} value
 * @returns {import('../processors/compensation.mjs').Compensation | undefined}
 *   Undefined for empty text; unrecognised text keeps `rawText` with a diagnostic.
 */
export function parseHelloWorldSalary(value) {
  const rawText = clean(value);
  if (!rawText) return undefined;
  // Only the observed Serbian decimal notation is numeric. No inferred period.
  const amount = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})';
  const pattern = `^${amount}(?:\\s*[-–]\\s*${amount})?\\s+(EUR|USD|RSD)\\s*\\((net|gross)\\)$`;
  const match = new RegExp(pattern).exec(rawText);
  if (!match)
    return normalizeCompensation({
      rawText,
      diagnostic: 'ambiguous-amount-or-currency',
    });
  const number = text => Number(text.replaceAll('.', '').replace(',', '.'));
  return normalizeCompensation({
    rawText,
    min: number(match[1]),
    max: number(match[2] ?? match[1]),
    currency: match[3],
    taxBasis: match[4],
    period: 'unknown',
  });
}

/**
 * Throw unless a `rel="next"` target is the same query, one page further, on our origin.
 * @param {URL} target
 * @param {URL} current
 * @param {number} offset Offset of the current page.
 */
function checkNextTarget(target, current, offset) {
  const nextOffset = Number(
    target.pathname.match(/^\/oglasi-za-posao\/stranica\/(\d+)\/?$/)?.[1],
  );
  const params = target.searchParams;
  const saved = params.get('disable_saved_search');
  const invalid =
    target.origin !== ORIGIN ||
    target.username ||
    target.password ||
    target.hash ||
    !Number.isSafeInteger(nextOffset) ||
    nextOffset !== offset + PAGE_SIZE ||
    params.getAll('q').length !== 1 ||
    params.get('q') !== current.searchParams.get('q') ||
    [...params.keys()].some(key => !ALLOWED_NEXT_PARAMS.includes(key)) ||
    params.getAll('disable_saved_search').length > 1 ||
    (params.has('disable_saved_search') && saved !== '0');
  if (invalid) broken('HelloWorld pagination changed query or did not advance');
}

/**
 * @param {object} root Parsed page.
 * @param {string} currentUrl
 * @returns {string | undefined} The validated next page URL; undefined on the last page.
 */
function nextPage(root, currentUrl) {
  const links = all(
    root,
    n =>
      ['a', 'link'].includes(n.tag) &&
      (n.attrs.rel ?? '').split(/\s+/).includes('next'),
  );
  if (!links.length) return undefined;
  const current = new URL(currentUrl);
  const offset = Number(
    current.pathname.match(/\/stranica\/(\d+)\/?$/)?.[1] ?? 0,
  );
  const targets = links.map(link => {
    let target;
    try {
      target = new URL(link.attrs.href, current);
    } catch {
      broken('Invalid HelloWorld next link');
    }
    checkNextTarget(target, current, offset);
    return target.href;
  });
  if (new Set(targets).size !== 1) broken('Conflicting HelloWorld next links');
  return targets[0];
}

/**
 * Find the job cards, or recognise a confirmed empty result.
 * @param {object} listing The `__search-results` node.
 * @returns {object[]} Card nodes; empty for a confirmed empty search.
 */
function findCards(listing) {
  const heading = nodeText(byClass(listing, '__search-title-and-sort')[0]);
  if (EMPTY_RESULTS_HEADING.test(heading)) {
    // The site fills an empty keyword search with unrelated newest adverts.
    if (!EMPTY_RESULTS_TEXT.test(nodeText(listing)))
      broken('Unconfirmed HelloWorld empty results');
    return [];
  }
  const links = all(listing, titleLink);
  if (!links.length || !NON_EMPTY_HEADING.test(heading))
    broken('Unknown HelloWorld listing contents');
  const cards = byClass(listing, 'rounded-lg').filter(
    n => hasClass(n, 'overflow-hidden') && all(n, titleLink).length,
  );
  if (
    cards.length !== links.length ||
    cards.some(n => all(n, titleLink).length !== 1)
  ) {
    broken('Unknown HelloWorld card structure');
  }
  return cards;
}

/**
 * Adapter `extract`: access check, card discovery and the strict next-link rule.
 * @param {string} html
 * @param {{ url: string }} ctx Page URL.
 * @returns {import('../processors/page-pipeline.mjs').PageExtraction & { nextUrl?: string }}
 */
function extractHelloWorld(html, { url }) {
  const root = parseHtml(html);
  checkAccess(root);
  const listing = byClass(root, '__search-results')[0];
  if (!listing) broken('HelloWorld listing container absent');
  const cards = findCards(listing);
  if (!cards.length) return { items: [], hasNext: false };
  // LEGACY(parser-pipeline): the next link is validated lazily, after the cards are mapped, because
  // a card error used to win over a pagination error. The pipeline reads hasNext/nextUrl last.
  let nextUrl;
  let resolved = false;
  const resolve = () => {
    if (!resolved) {
      nextUrl = nextPage(root, url);
      resolved = true;
    }
    return nextUrl;
  };
  return {
    items: cards,
    get hasNext() {
      return Boolean(resolve());
    },
    get nextUrl() {
      return resolve();
    },
  };
}

/**
 * @param {string} locationText Text of the map-marker row.
 * @returns {'hybrid' | 'remote' | 'unknown'}
 */
function workArrangementOf(locationText) {
  if (HYBRID_WORD.test(locationText)) return 'hybrid';
  if (REMOTE_WORDS.test(locationText)) return 'remote';
  return 'unknown';
}

/**
 * Adapter `values`: one card to makeJob input.
 * @param {object} card A job card node.
 * @returns {object}
 */
function helloWorldValues(card) {
  const link = all(card, titleLink)[0];
  // LEGACY(parser-pipeline): the location text is read from the row that holds the map-marker
  // icon and the salary from the coins icon row; the markup has no stable class for either.
  // The immediate icon row is used, which excludes ratings, dates and benefits.
  const iconText = icon => {
    const row = all(card, n =>
      n.children.some(c => typeof c !== 'string' && hasClass(c, icon)),
    )[0];
    return nodeText(row);
  };
  const locationText = iconText('la-map-marker');
  const workArrangement = workArrangementOf(locationText);
  const place = clean(
    locationText
      .replace(/Rad od kuće|\bRemote\b|\bHibrid\b/gi, '')
      .replace(/\s*\|\s*$/g, ''),
  );
  // A comma can belong to an ambiguous source label; do not invent cities.
  const locations = place && !/Inostranstvo/i.test(place) ? [place] : [];
  const salaryText = iconText('la-coins');
  const rawLabels = byClass(card, '__ga4_job_seniority').map(n => nodeText(n));
  const arrangementLabel =
    { remote: 'Remote', hybrid: 'Hybrid' }[workArrangement] ?? '';
  return {
    title: nodeText(link),
    url: link.attrs.href,
    company: nodeText(all(card, n => n.tag === 'h4')[0]),
    locationText,
    locations,
    workArrangement,
    location: [place, arrangementLabel].filter(Boolean).join(' | '),
    compensation: parseHelloWorldSalary(salaryText),
    salaryText,
    seniority: {
      rawLabels,
      levels: rawLabels
        .map(x => SENIORITY_LEVELS[x.toLowerCase()])
        .filter(Boolean),
    },
    skills: byClass(card, 'jobtag').map(n => nodeText(n)),
  };
}

/**
 * Adapter `finish`: the job id must match the card's `data-job-id`.
 * @param {object | null} job
 * @param {object} card
 * @returns {object} The same job.
 */
function checkJobIdentity(job, card) {
  const link = all(card, titleLink)[0];
  if (!job || job.sourceId !== link.attrs['data-job-id'])
    broken('Invalid HelloWorld vacancy identity');
  return job;
}

const helloWorldAdapter = {
  source: 'helloworld-rs',
  noValid: 'HelloWorld listing contains no valid vacancies',
  extract: extractHelloWorld,
  values: helloWorldValues,
  finish: checkJobIdentity,
};

/**
 * Parse one HelloWorld.rs listing page.
 * @param {string} html
 * @param {string} [url] Page URL, for validating the next link.
 * @returns {{ jobs: object[], hasNext: boolean, nextUrl?: string }}
 * @throws {SourceError} `access` for challenge pages, `broken-markup` for anything unconfirmed.
 */
export function parseHelloWorld(
  html,
  url = `${ORIGIN}${LISTING_PATH}?q=Python`,
) {
  return parsePage(helloWorldAdapter, html, { url });
}

/**
 * Fetch HelloWorld.rs jobs for every configured query, following validated next links.
 * @param {{ queries: string[], max_pages: number }} cfg
 * @param {any} ctx Guarded plugin context.
 * @param {{ retries?: number }} [options] Passed to the request layer.
 * @returns {Promise<object[]>}
 */
export function fetchHelloWorld(cfg, ctx, options) {
  const states = new Map();
  return paginate(
    'helloworld-rs',
    cfg.queries,
    cfg.max_pages,
    async (query, page) => {
      if (page === 1) {
        const first = new URL(LISTING_PATH, ORIGIN);
        first.searchParams.set('q', query);
        states.set(query, { url: first.href, urls: new Set(), ids: new Set() });
      }
      const state = states.get(query);
      const url = state.url;
      try {
        if (!url || state.urls.has(url)) broken('Repeated HelloWorld page');
        state.urls.add(url);
        const result = parseHelloWorld(
          await request(ctx, url, 'text', options),
          url,
        );
        if (
          result.jobs.length &&
          result.jobs.every(job => state.ids.has(job.sourceId))
        ) {
          broken('Repeated HelloWorld vacancies');
        }
        result.jobs.forEach(job => state.ids.add(job.sourceId));
        state.url = result.nextUrl;
        return result;
      } catch (error) {
        error.requestInfo = url;
        throw error;
      }
    },
    ctx,
  );
}
