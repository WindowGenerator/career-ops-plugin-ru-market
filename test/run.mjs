import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import plugin, { adapters } from '../index.mjs';
import { parseHh } from '../lib/hh.mjs';
import { parseHabr } from '../lib/habr-career.mjs';
import { parseGeekjob } from '../lib/geekjob.mjs';
import { parseConfig, SOURCES } from '../lib/config.mjs';
import { parseDate, parseSalary, jobUrl, normalizedCompany } from '../lib/normalize.mjs';
import { deduplicate } from '../lib/dedup.mjs';
import { withRetry, retryAfterMs } from '../lib/retry.mjs';
import { createQueue, enqueue } from '../lib/queue.mjs';
import { assertRequestUrl } from '../lib/http.mjs';
import { checkHealth } from '../scripts/health.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const fixture = (source, name = 'normal') => {
  const value = readFileSync(new URL(`../fixtures/${source}/${name}.${source === 'hh' ? 'json' : 'html'}`, import.meta.url), 'utf8');
  return source === 'hh' ? JSON.parse(value) : value;
};
const parsers = { hh: parseHh, 'habr-career': parseHabr, geekjob: parseGeekjob };
const parse = (source, name) => parsers[source](fixture(source, name));
const config = (source, max_pages = 2) => parseConfig({ ru_market: { source, max_pages } }).sources[source];
const ctxFor = run => ({ fetchText: run, fetchJson: run, log() {} });
const httpError = status => Object.assign(new Error(`HTTP ${status}`), { status });
const sourceFor = url => url.includes('api.hh.ru') ? 'hh' : url.includes('career.habr.com') ? 'habr-career' : 'geekjob';

for (const source of SOURCES) {
  test(`${source}: normal contract and salary`, () => {
    const { jobs, hasNext } = parse(source);
    assert.strictEqual(jobs.length, 1);
    assert.strictEqual(hasNext, true);
    assert.strictEqual(jobs[0].postedAt, source === 'geekjob' ? Date.parse('2026-09-25T00:00:00+03:00') : Date.parse('2026-09-25T10:30:00+03:00'));
    assert.deepStrictEqual(jobs[0].salary, { from: 250000, to: 350000, currency: 'RUB' });
    assert.match(jobs[0].location, /только из РФ/);
    assert.match(jobs[0].note, /net|на руки/);
    assert(!jobs[0].url.includes('?'));
    assert(!('sourceDetail' in jobs[0]));
  });
  test(`${source}: valid empty`, () => assert.deepStrictEqual(parse(source, 'empty').jobs, []));
  test(`${source}: broken markup`, () => assert.throws(() => parse(source, 'broken'), e => e.category === 'broken-markup'));
  test(`${source}: challenge`, () => assert.throws(() => parse(source, 'challenge'), e => e.category === 'access'));
  test(`${source}: pagination and safe endpoints`, async () => {
    const urls = [];
    const jobs = await adapters[source](config(source), ctxFor(async url => {
      assertRequestUrl(url); urls.push(url);
      return fixture(source, urls.length === 1 ? 'normal' : 'page2');
    }));
    assert.strictEqual(jobs.length, 2);
    assert.strictEqual(urls.length, 2);
    if (source === 'geekjob') assert.strictEqual(urls[1], 'https://geekjob.ru/vacancies/2');
    if (source === 'hh') assert.strictEqual(new URL(urls[1]).searchParams.get('page'), '1');
  });
  test(`${source}: duplicate cards/pages`, async () => {
    const jobs = await adapters[source](config(source), ctxFor(async () => fixture(source)));
    assert.strictEqual(jobs.length, 1);
  });
  test(`${source}: transient failure then success`, async () => {
    let count = 0;
    const jobs = await adapters[source](config(source, 1), ctxFor(async () => {
      if (++count === 1) throw httpError(503);
      return fixture(source);
    }));
    assert.strictEqual(count, 2); assert.strictEqual(jobs.length, 1);
  });
  test(`${source}: partial pagination failure`, async () => {
    let count = 0;
    const warnings = [];
    const ctx = { ...ctxFor(async () => { if (++count > 1) throw httpError(503); return fixture(source); }), log: (...args) => warnings.push(args[1]) };
    const jobs = await adapters[source](config(source), ctx);
    assert.strictEqual(jobs.length, 1); assert.strictEqual(count, 4);
    assert.deepStrictEqual(warnings.map(JSON.parse), [{ source, completed_pages: 1, failed_page: 2, category: 'server' }]);
  });
  test(`${source}: access failures are not retried`, async () => {
    let count = 0;
    await assert.rejects(adapters[source](config(source), ctxFor(async () => { count++; throw httpError(403); })));
    assert.strictEqual(count, 1);
  });
  test(`${source}: missing optional fields`, () => {
    let value = fixture(source);
    if (source === 'hh') value.items = [{ id: '103', name: 'Engineer' }];
    else if (source === 'habr-career') value = '<div class="vacancy-card"><a class="vacancy-card__title-link" href="/vacancies/203">Engineer</a></div>';
    else value = '<ul class="serp-list" id="serplist"><li class="collection-item avatar"><a class="title" href="/vacancy/000000000000000000000303">Engineer</a></li></ul>';
    const job = parsers[source](value).jobs[0];
    assert(job); assert.strictEqual(job.company, ''); assert(!('postedAt' in job)); assert(!('salary' in job));
  });
  test(`${source}: malformed URLs`, () => {
    let value = fixture(source);
    if (source === 'hh') value.items[0].alternate_url = 'https://evil.example/vacancy/101';
    else value = value.replace(/href="[^\"]*" class="vacancy-card__title-link"|class="title" href="[^\"]*"/g, source === 'habr-career'
      ? 'href="javascript:alert(1)" class="vacancy-card__title-link"' : 'class="title" href="https://evil.example/vacancy/000000000000000000000301"');
    assert.throws(() => parsers[source](value), e => e.category === 'broken-markup');
  });
}

test('HH auto never falls back to HTML', async () => {
  const urls = [];
  await assert.rejects(plugin.provider.fetch({ ru_market: { source: 'hh', sources: { hh: { mode: 'auto' } } } }, ctxFor(async url => { urls.push(url); throw httpError(403); })));
  assert.strictEqual(urls.length, 1); assert(urls.every(u => new URL(u).hostname === 'api.hh.ru'));
});
test('high confidence merges all links, HH primary', () => {
  const jobs = SOURCES.flatMap(s => parse(s).jobs);
  const merged = deduplicate(jobs);
  assert.strictEqual(merged.length, 1); assert.match(merged[0].url, /hh.ru/);
  for (const job of jobs.slice(1)) assert(merged[0].note.includes(job.url));
  assert.match(merged[0].note, /Habr Career salary/);
  assert.strictEqual(jobs[0].note.includes('cross-listed'), false);
});
test('primary source override', () => {
  assert.match(deduplicate(SOURCES.flatMap(s => parse(s).jobs), ['geekjob', 'hh', 'habr-career'])[0].url, /geekjob/);
});
test('medium confidence preserves reciprocal links', () => {
  const jobs = ['hh', 'habr-career'].flatMap(s => parse(s).jobs).map(j => ({ ...j, description: '' }));
  const result = deduplicate(jobs);
  assert.strictEqual(result.length, 2);
  assert(result[0].note.includes(`possible cross-listing: Habr Career ${result[1].url}`));
  assert(result[1].note.includes(`possible cross-listing: HH ${result[0].url}`));
});
test('same title/company different locations, teams or salaries never merge', () => {
  const [a, b] = ['hh', 'habr-career'].flatMap(s => parse(s).jobs);
  for (const changes of [{ location: 'Казань / офис' }, { description: 'Анализ товарных остатков логистика поставки склад учёт бухгалтерские документы поддержка сотрудников магазинов обработка заявок клиентов' }, { salary: { from: 500000, currency: 'RUB' } }]) {
    const result = deduplicate([a, { ...b, ...changes }]);
    assert.strictEqual(result.length, 2); assert(!result[0].note.includes('cross-listing'));
  }
  assert.strictEqual(deduplicate([a, { ...a, url: 'https://hh.ru/vacancy/999' }]).length, 2);
});
test('complete-link grouping prevents merging distinct same-board vacancies', () => {
  const [a, b] = ['hh', 'habr-career'].flatMap(s => parse(s).jobs);
  const result = deduplicate([a, b, { ...b, url: 'https://career.habr.com/vacancies/999' }]);
  assert.strictEqual(result.length, 2);
});
test('one failed source preserves other results', async () => {
  const jobs = await plugin.provider.fetch({ ru_market: { source: 'all' } }, ctxFor(async url => {
    const source = sourceFor(url); if (source === 'hh') throw httpError(403); return fixture(source);
  }));
  assert.strictEqual(jobs.length, 1); assert.match(jobs[0].url, /habr/); assert.match(jobs[0].note, /GeekJob/);
});
test('all failed sources is an error, not empty', async () => {
  await assert.rejects(plugin.provider.fetch({ ru_market: { source: 'all' } }, ctxFor(async () => { throw httpError(403); })), e => e.category === 'sources-failed');
});
test('disabled source makes no requests', async () => {
  const urls = [];
  await plugin.provider.fetch({ ru_market: { source: 'all', sources: { hh: { enabled: false }, geekjob: { enabled: false } } } }, ctxFor(async url => { urls.push(url); return fixture('habr-career'); }));
  assert.strictEqual(urls.length, 1); assert.match(urls[0], /career.habr.com/);
});
test('strict configuration and precedence', () => {
  for (const raw of [{ source: 'bad' }, { max_pages: 0 }, { max_pages: 1.5 }, { max_pages: '3' }, { max_pages: 21 }, { sources: { nope: {} } }, { sources: { hh: { mode: 'html' } } }, { sources: { hh: { queries: 'Python' } } }, { sources: { hh: { queries: [3] } } }, { sources: { hh: { queries: [] } } }, { sources: { hh: { host: 'evil.example' } } }, { sources: { habr_career: { categories: ['../users'] } } }, { primary_source_order: ['hh'] }]) {
    assert.throws(() => parseConfig({ ru_market: raw }), e => e.category === 'config');
  }
  const cfg = parseConfig({ ru_market: { max_pages: 3, future_field: 'ignored', sources: { hh: { max_pages: 2 } } } });
  assert.strictEqual(cfg.sources.hh.max_pages, 2); assert.strictEqual(cfg.sources.geekjob.max_pages, 3);
});
test('localized date validation, timezone, year rollover; unknown dates omitted', () => {
  assert.strictEqual(parseDate('31 декабря', Date.parse('2026-01-02T00:00:00Z')), Date.parse('2025-12-31T00:00:00+03:00'));
  assert.strictEqual(parseDate('Опубликовано 5 января 2024'), Date.parse('2024-01-05T00:00:00+03:00'));
  for (const value of ['', 'вчера', 'Обновлено 5 января 2024', '31 февраля 2026', '2026-02-30', '2026-01-01T12:00:00']) assert.strictEqual(parseDate(value), undefined);
  const geek = parseGeekjob(fixture('geekjob').replace('itemprop="datePosted"', '').replace('Опубликовано ', ''));
  assert(!('postedAt' in geek.jobs[0]));
  const habr = parseHabr(fixture('habr-career').replace('>25 сентября</time>', '>Обновлено 25 сентября</time>'));
  assert(!('postedAt' in habr.jobs[0]));
});
test('salary variants and predicted salary', () => {
  assert.deepStrictEqual(parseSalary('до 4 000 USD gross'), { to: 4000, currency: 'USD' });
  assert.deepStrictEqual(parseSalary('от 250 тыс. руб. на руки'), { from: 250000, currency: 'RUB' });
  assert.deepStrictEqual(parseSalary('3.5k — 4k € / месяц'), { from: 3500, to: 4000, currency: 'EUR' });
  assert.strictEqual(parseSalary('по договорённости'), undefined);
  const text = fixture('habr-career').replace('class="basic-salary"', 'class="predicted-salary"');
  assert.strictEqual(parseHabr(text).jobs[0].salary, undefined);
});
test('company preserves original and does not transliterate', () => {
  assert.strictEqual(normalizedCompany('ООО «Тестовая компания»'), 'тестовая компания');
  assert.notStrictEqual(normalizedCompany('Яндекс'), normalizedCompany('Yandex'));
  assert.strictEqual(parse('hh').jobs[0].company, 'ООО «Тестовая компания»');
});
test('egress guard rejects private/action/foreign URLs', () => {
  for (const url of ['https://geekjob.ru/json/vacancies', 'https://geekjob.ru/rest/x', 'https://career.habr.com/users', 'https://employer.example/jobs', 'http://api.hh.ru/vacancies', 'https://api.hh.ru:444/vacancies']) assert.throws(() => assertRequestUrl(url));
  for (const url of ['javascript:alert(1)', 'https://hh.ru.evil.example/vacancy/1', 'https://user@hh.ru/vacancy/1', '/vacancy/not-an-id']) assert.strictEqual(jobUrl(url, 'hh'), undefined);
});
test('retry policy and bounded Retry-After', async () => {
  const delays = []; let calls = 0;
  const error = Object.assign(httpError(429), { headers: { 'retry-after': '99999999' } });
  await withRetry(async () => { if (++calls < 3) throw error; return true; }, { wait: async ms => delays.push(ms), random: () => 0 });
  assert.deepStrictEqual(delays, [10000, 10000]);
  assert.strictEqual(retryAfterMs({ retryAfter: 'invalid' }), 0);
  assert.strictEqual(retryAfterMs({ retryAfter: 'Thu, 01 Jan 1970 00:00:03 GMT' }, 1000), 2000);
  for (const error of [httpError(400), new SyntaxError('bad JSON'), new Error('parser bug')]) {
    let calls = 0;
    await assert.rejects(withRetry(async () => { calls++; throw error; }, { wait: async () => {} }));
    assert.strictEqual(calls, 1);
  }
  let networkCalls = 0;
  await withRetry(async () => { if (++networkCalls === 1) throw new TypeError('fetch failed'); }, { wait: async () => {} });
  assert.strictEqual(networkCalls, 2);
});
test('queue concurrency, pacing and recovery after failure', async () => {
  let now = 0, active = 0, peak = 0;
  const starts = [];
  const queue = createQueue({ concurrency: 1, spacingMs: 750, now: () => now, wait: async ms => { now += ms; } });
  const results = await Promise.allSettled([0, 1, 2].map(i => queue(async () => {
    active++; peak = Math.max(peak, active); starts.push(now); await Promise.resolve(); active--;
    if (i === 1) throw new Error('fail'); return i;
  })));
  assert.strictEqual(peak, 1); assert.deepStrictEqual(starts, [0, 750, 1500]); assert.strictEqual(results[2].value, 2);
});
test('host queues are independent and HH concurrency is two', async () => {
  let release, started;
  const gate = new Promise(r => { release = r; });
  const ready = new Promise(r => { started = r; });
  const blocked = enqueue('career.habr.com', async () => { started(); await gate; });
  await ready;
  let otherRan = false;
  await enqueue('geekjob.ru', async () => { otherRan = true; });
  assert(otherRan); release(); await blocked;
  let running = 0, peak = 0;
  await Promise.all([1, 2, 3, 4].map(() => enqueue('api.hh.ru', async () => {
    running++; peak = Math.max(peak, running); await new Promise(r => setTimeout(r, 10)); running--;
  })));
  assert.strictEqual(peak, 2);
});
test('health is one page/request per source, no vacancy payloads', async () => {
  const calls = [];
  const result = await checkHealth(ctxFor(async url => { calls.push(url); return fixture(sourceFor(url), 'empty'); }));
  assert(result.ok); assert.strictEqual(calls.length, 3); assert(result.sources.every(s => s.status === 'empty'));
  assert(!JSON.stringify(result).includes('company'));
  const errors = { hh: httpError(429), 'habr-career': httpError(403), geekjob: httpError(503) };
  const failed = await checkHealth(ctxFor(async url => { throw errors[sourceFor(url)]; }));
  assert.strictEqual(failed.ok, false);
  assert.deepStrictEqual(failed.sources.map(s => s.status), ['rate-limited', 'access', 'server']);
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`FAIL - ${name}`, error); }
}
console.log(`${tests.length - failures}/${tests.length} tests passed`);
process.exitCode = failures ? 1 : 0;
