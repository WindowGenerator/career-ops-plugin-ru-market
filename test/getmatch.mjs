import { strict as assert } from 'node:assert';
const tests = [];
const test = (name, run) => tests.push({ name, run });
import { readFileSync } from 'node:fs';
import plugin, { adapters } from '../index.mjs';
import { parseGetmatch } from '../lib/getmatch.mjs';
import { parseConfig, SOURCES, DEFAULT_SOURCES } from '../lib/config.mjs';
import { jobUrl } from '../lib/normalize.mjs';
import { deduplicate, localDedup, confidence } from '../lib/dedup.mjs';
import { assertRequestUrl } from '../lib/http.mjs';
import { paginate } from '../lib/paginate.mjs';
import { checkHealth } from '../scripts/health.mjs';
const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/getmatch/normal.json', import.meta.url)));
const entry = { ru_market: { source: 'getmatch', sources: { getmatch: { enabled: true, max_pages: 3, per_page: 1 } } } };
const cfg = () => parseConfig(entry).sources.getmatch;
const ctx = fetchJson => ({ fetchJson, log() {} });
const statusError = status => Object.assign(new Error(`HTTP ${status}`), { status });
const page = (offset, id = 602) => {
  const data = fixture(); data.meta.offset = offset;
  data.offers[1].id = id; data.offers[1].url = `/vacancies/${id}-python-platform-engineer`;
  return data;
};

test('getmatch: only ordinary active vacancies and allowed metadata', () => {
  const { jobs, hasNext } = parseGetmatch(fixture());
  assert.equal(jobs.length, 1); assert.equal(hasNext, true);
  assert.equal(jobs[0].url, 'https://getmatch.ru/vacancies/601-python-platform-engineer');
  assert.equal(jobs[0].company, 'Synthetic Platform');
  assert.match(jobs[0].location, /Россия.*Удалённо/);
  assert.deepEqual(jobs[0].salary, { min: 250000, max: 350000, currency: 'RUB' });
  assert.match(jobs[0].note, /salary taxes: net/);
  assert.equal(jobs[0].postedAt, Date.parse('2026-10-07T10:00:00+03:00'));
  assert(!('application' in jobs[0])); assert(!('description' in jobs[0]));
  const data = fixture(); data.offers.push({ ...data.offers[1], id: 603, url: '/vacancies/603-archived', is_active: false });
  data.offers.push({ offer_type: 'unknown_promotion' });
  assert.equal(parseGetmatch(data).jobs.length, 1);
});
test('getmatch: hidden, estimated, missing currency, incognito and naive date', () => {
  for (const patch of [{ salary_hidden: true }, { salary_by_our_version: true }, { salary_currency: null }, { salary_hidden: undefined }]) {
    const data = fixture(); Object.assign(data.offers[1], patch);
    assert.equal(parseGetmatch(data).jobs[0].salary, undefined);
    if (patch.salary_hidden !== false && !('salary_currency' in patch)) assert(!parseGetmatch(data).jobs[0].note.includes('250000'));
  }
  const data = fixture(); Object.assign(data.offers[1], { incognito_publication: true, published_at: '2026-10-07T10:00:00' });
  data.offers[1].location_items.push({ label: 'США', format: 'remote', exclude: true });
  const job = parseGetmatch(data).jobs[0];
  assert.equal(job.company, ''); assert.equal(job.postedAt, undefined); assert.match(job.location, /Исключено: США/);
});
test('getmatch: broken schema differs from valid empty and ID must match URL', () => {
  assert.deepEqual(parseGetmatch({ offers: [], meta: { total: 0, offset: 0, limit: 20 } }).jobs, []);
  for (const data of [{}, { offers: [], meta: { total: '1', offset: 0, limit: 1 } }, { offers: [], meta: { total: 0, offset: -1, limit: 1 } }]) {
    assert.throws(() => parseGetmatch(data), e => e.category === 'broken-markup');
  }
  for (const patch of [{ id: 999 }, { url: 'https://evil.example/vacancies/601-job' }, { is_active: 'true' }, { location_items: [{}] }]) {
    const data = fixture(); Object.assign(data.offers[1], patch);
    assert.throws(() => parseGetmatch(data), e => e.category === 'broken-markup');
  }
});
test('getmatch: stable numeric identity across slug changes, distinct IDs stay separate', () => {
  const a = parseGetmatch(fixture()).jobs[0]; const b = { ...a, url: 'https://getmatch.ru/vacancies/601-new-slug' };
  const c = { ...a, url: 'https://getmatch.ru/vacancies/602-same-title' };
  assert.equal(confidence(a, b), 'high'); assert.equal(confidence(a, c), 'low');
  assert.equal(localDedup([a, b, c]).length, 2); assert.equal(deduplicate([a, b, c], ['getmatch']).length, 2);
});
test('getmatch: opt-in and backward-compatible source orders', () => {
  assert.deepEqual(parseConfig({ ru_market: {} }).selected, DEFAULT_SOURCES);
  assert.throws(() => parseConfig({ ru_market: { source: 'getmatch' } }), /No enabled/);
  for (const order of [DEFAULT_SOURCES, SOURCES.slice(0, 5), [...SOURCES].reverse()]) {
    const parsed = parseConfig({ ru_market: { primary_source_order: order } });
    assert.deepEqual(parsed.order.slice(0, order.length), order); assert.equal(parsed.order.length, SOURCES.length);
  }
  for (const options of [{ queries: ['Python'] }, { format: 'remote' }, { per_page: 0 }, { mode: 'html' }]) {
    assert.throws(() => parseConfig({ ru_market: { sources: { getmatch: options } } }));
  }
  assert.equal(cfg().per_page, 1);
});
test('getmatch: endpoint and canonical URL boundaries', () => {
  assertRequestUrl('https://getmatch.ru/api/offers?limit=1');
  for (const url of ['https://getmatch.ru/api/offers/601', 'https://getmatch.ru/api/profiles', 'https://getmatch.ru/api/auth',
    'https://getmatch.ru/api/apply', 'https://getmatch.ru:444/api/offers', 'http://getmatch.ru/api/offers', 'https://evil.example/api/offers']) assert.throws(() => assertRequestUrl(url));
  for (const url of ['https://evil.example/vacancies/601-job', 'http://getmatch.ru/vacancies/601-job', 'https://u:p@getmatch.ru/vacancies/601-job',
    'https://getmatch.ru:444/vacancies/601-job', '/vacancies/abc-job', '/profiles/601']) assert.equal(jobUrl(url, 'getmatch'), undefined);
});
test('getmatch: pagination uses meta despite promotions and respects hard limit', async () => {
  const urls = [];
  const jobs = await adapters.getmatch(cfg(), ctx(async (value, opts) => {
    const url = new URL(value); urls.push(url); assert.equal(opts.headers.Accept, 'application/json'); assert(!opts.headers.Authorization);
    return urls.length === 1 ? fixture() : page(1);
  }), { retries: 0 });
  assert.equal(jobs.length, 2); assert.equal(urls.length, 2);
  assert.equal(urls[1].searchParams.get('offset'), '1'); assert.equal(urls[1].searchParams.get('p'), '2');
  let calls = 0;
  await adapters.getmatch({ ...cfg(), max_pages: 1 }, ctx(async () => { calls++; return fixture(); }));
  assert.equal(calls, 1);
});
test('getmatch: continue through promotions-only and inactive page', async () => {
  for (const promotionsOnly of [true, false]) {
    let calls = 0;
    const jobs = await adapters.getmatch(cfg(), ctx(async () => {
      if (++calls === 2) return page(1);
      const data = fixture(); if (promotionsOnly) data.offers.pop(); else data.offers[1].is_active = false;
      return data;
    }));
    assert.equal(calls, 2); assert.equal(jobs.length, 1); assert.equal(jobs.sourceStatus.status, 'ok');
  }
});
test('getmatch: repeated IDs or wrong offset return diagnostic partial result', async () => {
  for (const repeatIds of [true, false]) {
    let calls = 0;
    const jobs = await adapters.getmatch(cfg(), ctx(async () => ++calls === 1 ? fixture() : repeatIds ? page(1, 601) : page(0)));
    assert.equal(calls, 2); assert.equal(jobs.length, 1);
    assert.equal(jobs.sourceStatus.status, 'partial'); assert.equal(jobs.sourceStatus.category, 'broken-markup');
  }
});
test('getmatch: first/late access failure, no retries, safe diagnostics and source isolation', async () => {
  let calls = 0; const logs = [];
  const jobs = await adapters.getmatch(cfg(), { ...ctx(async () => { if (++calls > 1) throw statusError(403); return fixture(); }), log: (_, s) => logs.push(s) });
  assert.equal(calls, 2); assert.equal(jobs.sourceStatus.status, 'partial'); assert.equal(jobs.sourceStatus.http_status, 403);
  assert(!JSON.stringify(logs).includes('Synthetic Platform'));
  calls = 0;
  await assert.rejects(plugin.provider.fetch(entry, ctx(async () => { calls++; throw statusError(401); })), e => e.sourceStatuses[0].status === 'failed');
  assert.equal(calls, 1);
  let routeCalls = 0;
  await assert.rejects(paginate('getmatch', ['a', 'b'], 2, async () => { routeCalls++; throw statusError(403); }, ctx()), /403/);
  assert.equal(routeCalls, 1);
  const merged = await plugin.provider.fetch({ ru_market: { source: 'all', sources: { habr_career: { enabled: false }, geekjob: { enabled: false }, getmatch: { enabled: true }, trudvsem: { enabled: true } } } }, ctx(async value => {
    if (value.includes('getmatch.ru')) throw statusError(403);
    return { status: '200', meta: { total: 0 }, results: { vacancies: [] } };
  }));
  assert.equal(merged.sourceStatuses.find(s => s.source === 'getmatch').status, 'failed');
});
test('getmatch: experimental filters are opt-in; default requests are unchanged', async () => {
  const urls = [];
  const run = async (options, pages = 1) => {
    urls.length = 0;
    const config = parseConfig({ ru_market: { source: 'getmatch', sources: { getmatch: { enabled: true, max_pages: pages, per_page: 1, ...options } } } }).sources.getmatch;
    await adapters.getmatch(config, ctx(async value => { urls.push(value); return page(urls.length - 1, 602 + urls.length); }));
    return urls.slice();
  };
  assert.deepEqual(await run({}, 2), ['https://getmatch.ru/api/offers?p=1&offset=0&limit=1', 'https://getmatch.ru/api/offers?p=2&offset=1&limit=1']);
  assert.deepEqual(await run({ sa: 300000, pa: '7', se: ['senior', 'middle'], l: ['Москва', 'Remote'] }),
    ['https://getmatch.ru/api/offers?p=1&offset=0&limit=1&sa=300000&pa=7&se=senior&se=middle&l=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0&l=Remote']);
  assert.deepEqual(await run({ l: 'Berlin' }), ['https://getmatch.ru/api/offers?p=1&offset=0&limit=1&l=Berlin']);
  for (const url of urls) assert.doesNotThrow(() => assertRequestUrl(url));
  const keys = new Set(); for (const options of [{ sa: 1 }, { pa: 'x' }, { se: ['a'] }, { l: ['a'] }]) (await run(options)).forEach(u => new URL(u).searchParams.forEach((_, k) => keys.add(k)));
  assert.deepEqual([...keys].sort(), ['l', 'limit', 'offset', 'p', 'pa', 'sa', 'se']);
  for (const bad of [{ sa: [1] }, { pa: ['1'] }, { sa: '' }, { se: [] }, { l: ['a&b=1'] }, { l: Array(11).fill('a') }, { se: [3, {}] }, { s: 'x' }, { sp: ['x'] }, { from_date: '2026-01-01' }, { q: 'python' }]) {
    assert.throws(() => parseConfig({ ru_market: { source: 'getmatch', sources: { getmatch: { enabled: true, ...bad } } } }), e => e.category === 'config', JSON.stringify(bad));
  }
  assert.equal(cfg().sa, undefined);
});
test('getmatch: health requires explicit selection and makes one request without retries', async () => {
  let calls = 0;
  const result = await checkHealth(ctx(async () => { calls++; return fixture(); }), { source: 'getmatch' });
  assert.equal(calls, 1); assert.equal(result.sources[0].source, 'getmatch'); assert.equal(result.ok, true);
  calls = 0;
  await checkHealth(ctx(async () => { calls++; throw statusError(503); }), { source: 'getmatch' });
  assert.equal(calls, 1);
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`FAIL - ${name}`, error); }
}
console.log(`${tests.length - failures}/${tests.length} getmatch tests passed`);
process.exitCode = failures ? 1 : 0;
