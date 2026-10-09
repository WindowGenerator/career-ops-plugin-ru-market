import { all, byClass, checkAccess, hasClass, nodeText, parseHtml } from './html.mjs';
import { clean, makeJob } from './normalize.mjs';
import { normalizeCompensation } from './compensation.mjs';
import { SourceError } from './errors.mjs';
import { localDedup } from './dedup.mjs';
import { request } from './http.mjs';
import { paginate } from './paginate.mjs';

const origin = 'https://www.helloworld.rs';
const broken = message => { throw new SourceError('broken-markup', message); };
const titleLink = n => n.tag === 'a' && hasClass(n, '__ga4_job_title');

export function parseHelloWorldSalary(value) {
  const rawText = clean(value);
  if (!rawText) return undefined;
  // Only the observed Serbian decimal notation is numeric. No inferred period.
  const amount = '(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})';
  const match = new RegExp(`^${amount}(?:\\s*[-–]\\s*${amount})?\\s+(EUR|USD|RSD)\\s*\\((net|gross)\\)$`).exec(rawText);
  if (!match) return normalizeCompensation({ rawText, diagnostic: 'ambiguous-amount-or-currency' });
  const number = s => Number(s.replaceAll('.', '').replace(',', '.'));
  return normalizeCompensation({ rawText, min: number(match[1]), max: number(match[2] ?? match[1]),
    currency: match[3], taxBasis: match[4], period: 'unknown' });
}

function nextPage(root, currentUrl) {
  const links = all(root, n => ['a', 'link'].includes(n.tag) && (n.attrs.rel ?? '').split(/\s+/).includes('next'));
  if (!links.length) return undefined;
  const current = new URL(currentUrl);
  const offset = Number(current.pathname.match(/\/stranica\/(\d+)\/?$/)?.[1] ?? 0);
  const targets = links.map(n => {
    let target;
    try { target = new URL(n.attrs.href, current); } catch { broken('Invalid HelloWorld next link'); }
    const nextOffset = Number(target.pathname.match(/^\/oglasi-za-posao\/stranica\/(\d+)\/?$/)?.[1]);
    if (target.origin !== origin || target.username || target.password || target.hash
      || !Number.isSafeInteger(nextOffset) || nextOffset !== offset + 30
      || target.searchParams.getAll('q').length !== 1 || target.searchParams.get('q') !== current.searchParams.get('q')
      || [...target.searchParams.keys()].some(k => !['q', 'disable_saved_search'].includes(k))
      || target.searchParams.getAll('disable_saved_search').length > 1
      || (target.searchParams.has('disable_saved_search') && target.searchParams.get('disable_saved_search') !== '0')) {
      broken('HelloWorld pagination changed query or did not advance');
    }
    return target.href;
  });
  if (new Set(targets).size !== 1) broken('Conflicting HelloWorld next links');
  return targets[0];
}

export function parseHelloWorld(html, url = `${origin}/oglasi-za-posao?q=Python`) {
  const root = parseHtml(html);
  checkAccess(root);
  const listing = byClass(root, '__search-results')[0];
  if (!listing) broken('HelloWorld listing container absent');
  const heading = nodeText(byClass(listing, '__search-title-and-sort')[0]);
  if (/\(0 oglasa\)/.test(heading)) {
    // The site fills an empty keyword search with unrelated newest adverts.
    if (!/Trenutno nema oglasa po traženim kriterijumima pretrage\./.test(nodeText(listing))) broken('Unconfirmed HelloWorld empty results');
    return { jobs: [], hasNext: false };
  }
  const links = all(listing, titleLink);
  if (!links.length || !/\([1-9]\d* oglasa?\)/.test(heading)) broken('Unknown HelloWorld listing contents');
  const cards = byClass(listing, 'rounded-lg').filter(n => hasClass(n, 'overflow-hidden') && all(n, titleLink).length);
  if (cards.length !== links.length || cards.some(n => all(n, titleLink).length !== 1)) broken('Unknown HelloWorld card structure');
  const jobs = cards.map(card => {
    const link = all(card, titleLink)[0];
    // Read the immediate icon row, excluding ratings, dates and benefits.
    const iconText = icon => {
      const row = all(card, n => n.children.some(c => typeof c !== 'string' && hasClass(c, icon)))[0];
      return nodeText(row);
    };
    const locationText = iconText('la-map-marker');
    const workArrangement = /\bHibrid\b/i.test(locationText) ? 'hybrid'
      : /Rad od kuće|\bRemote\b/i.test(locationText) ? 'remote' : 'unknown';
    const place = clean(locationText.replace(/Rad od kuće|\bRemote\b|\bHibrid\b/gi, '').replace(/\s*\|\s*$/g, ''));
    // A comma can belong to an ambiguous source label; do not invent cities.
    const locations = place && !/Inostranstvo/i.test(place) ? [place] : [];
    const salaryText = iconText('la-coins');
    const compensation = parseHelloWorldSalary(salaryText);
    const rawLabels = byClass(card, '__ga4_job_seniority').map(n => nodeText(n));
    const mapping = { junior: 'entry', intermediate: 'mid', senior: 'senior' };
    const job = makeJob('helloworld-rs', { title: nodeText(link), url: link.attrs.href,
      company: nodeText(all(card, n => n.tag === 'h4')[0]), locationText, locations, workArrangement,
      location: [place, workArrangement === 'remote' ? 'Remote' : workArrangement === 'hybrid' ? 'Hybrid' : ''].filter(Boolean).join(' | '),
      compensation, salaryText,
      seniority: { rawLabels, levels: rawLabels.map(x => mapping[x.toLowerCase()]).filter(Boolean) },
      skills: byClass(card, 'jobtag').map(n => nodeText(n)) });
    if (!job || job.sourceId !== link.attrs['data-job-id']) broken('Invalid HelloWorld vacancy identity');
    return job;
  });
  const nextUrl = nextPage(root, url);
  return { jobs: localDedup(jobs), hasNext: Boolean(nextUrl), nextUrl };
}

export function fetchHelloWorld(cfg, ctx, options) {
  const states = new Map();
  return paginate('helloworld-rs', cfg.queries, cfg.max_pages, async (query, page) => {
    if (page === 1) {
      const url = new URL('/oglasi-za-posao', origin);
      url.searchParams.set('q', query);
      states.set(query, { url: url.href, urls: new Set(), ids: new Set() });
    }
    const state = states.get(query);
    const url = state.url;
    try {
      if (!url || state.urls.has(url)) broken('Repeated HelloWorld page');
      state.urls.add(url);
      const result = parseHelloWorld(await request(ctx, url, 'text', options), url);
      if (result.jobs.length && result.jobs.every(job => state.ids.has(job.sourceId))) broken('Repeated HelloWorld vacancies');
      result.jobs.forEach(job => state.ids.add(job.sourceId));
      state.url = result.nextUrl;
      return result;
    } catch (error) { error.requestInfo = url; throw error; }
  }, ctx);
}
