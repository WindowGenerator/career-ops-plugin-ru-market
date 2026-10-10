import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import plugin from '../index.mjs';
import { parseHelloWorld, parseHelloWorldSalary, fetchHelloWorld } from '../lib/helloworld.mjs';
import { parseConfig, SOURCES, DEFAULT_SOURCES } from '../lib/config.mjs';
import { assertRequestUrl } from '../lib/http.mjs';
import { jobUrl } from '../lib/normalize.mjs';
import { checkHealth } from '../scripts/health.mjs';
const fixture = name => readFileSync(new URL(`../fixtures/helloworld-rs/${name}.html`, import.meta.url), 'utf8');
const url = 'https://www.helloworld.rs/oglasi-za-posao?q=Data+Engineer';
const parse = html => parseHelloWorld(html, url);
const entry = (patch = {}) => ({ ru_market: { source: 'helloworld-rs', sources: { helloworld_rs: { enabled: true, queries: ['Data Engineer'], ...patch } } } });
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('observed cards: fields, unknown geography, multiple levels, no expiry publication date', () => {
  const { jobs, nextUrl } = parse(fixture('normal'));
  assert.equal(jobs.length, 4); assert(nextUrl.includes('/stranica/30?'));
  assert.equal(jobs[0].title, 'Data Engineer'); assert.equal(jobs[0].company, 'Bel-Dev d.o.o.');
  assert.equal(jobs[0].sourceId, '760224'); assert.equal(jobs[0].url, 'https://www.helloworld.rs/posao/Data-Engineer/Bel-Dev-d.o.o/760224');
  assert.equal(jobs[0].location, 'Beograd | Hybrid'); assert.equal(jobs[0].locationText, 'Beograd | Hibrid');
  assert.deepEqual(jobs[0].locations, ['Beograd']); assert.equal(jobs[0].workArrangement, 'hybrid');
  assert.deepEqual(jobs[0].seniority, { levels: ['senior'], rawLabels: ['Senior'] });
  assert.deepEqual(jobs[0].skills, ['SQL', 'Python', 'Batch', 'Kubernetes']);
  assert.equal(jobs[1].workArrangement, 'unknown'); assert.equal(jobs[2].workArrangement, 'remote');
  assert.deepEqual(jobs[2].locations, []); assert.deepEqual(jobs[2].eligibility, { status: 'unknown' });
  assert.deepEqual(jobs[3].seniority.levels, ['mid', 'senior']); assert.deepEqual(jobs[3].locations, []);
  for (const job of jobs) { assert.equal(job.postedAt, undefined); assert.equal(job.description, undefined); assert.equal(job.hasDescription, false); assert.equal(job.dataLevel, 'listing'); }
});
test('synthetic metadata variants: unknown/missing labels, duplicate skills, ambiguous city', () => {
  const last = fixture('last');
  assert.equal(parse(last.replace('(96 oglasa)', '(1 oglas)')).jobs.length, 1);
  const unknown = parse(last.replace(/Senior/g, 'Principal')).jobs[0];
  assert.deepEqual(unknown.seniority, { levels: [], rawLabels: ['Principal'] });
  const repeated = parse(last.replace('</button>', '</button><button class="__ga4_job_seniority">Senior</button>').replace('</div>\n', '<a class="jobtag">Python</a><a class="jobtag">Python</a></div>\n')).jobs[0];
  assert.deepEqual(repeated.seniority.levels, ['senior']); assert.equal(repeated.skills.filter(x => x === 'Python').length, 1);
  const missing = parse(last.replace(/<button[^]*?<\/button>/g, '').replace(/<a[^>]*class="[^"]*jobtag[^]*?<\/a>/g, '')).jobs[0];
  assert.equal(missing.seniority, undefined); assert.equal(missing.skills, undefined);
  const synthetic = parse(last.replace('>Remote<', '>Beograd, Novi Sad | Hibrid<').replace('Senior', 'Junior')).jobs[0];
  assert.deepEqual(synthetic.seniority.levels, ['entry']); assert.deepEqual(synthetic.locations, ['Beograd, Novi Sad']);
  const remote = parse(last.replace('Inostranstvo, Inostranstvo | Rad od kuće', 'Remote')).jobs[0];
  assert.equal(remote.location, 'Remote'); assert.deepEqual(remote.locations, []);
});
test('salary: observed Serbian amounts, explicit taxes, unknown periods and ambiguous fallback', () => {
  const job = parse(fixture('salary')).jobs[0];
  assert.deepEqual(job.compensation, { min: 2600, max: 2700, currency: 'EUR', period: 'unknown', taxBasis: 'net', rawText: '2.600,00 - 2.700,00 EUR (net)' });
  assert.equal(parseHelloWorldSalary('48.000,00 - 90.000,00 USD (gross)').max, 90000);
  assert.equal(parseHelloWorldSalary('14,00 - 18,00 EUR (net)').min, 14);
  for (const raw of ['2,600.00 EUR (net)', '2.600 EUR (net)', 'EUR 3000', '90,00 - 40,00 EUR (net)']) {
    assert.equal(parseHelloWorldSalary(raw).min, undefined); assert.equal(parseHelloWorldSalary(raw).rawText, raw);
  }
});
test('empty excludes newest recommendations; broken/access remain errors', () => {
  assert.deepEqual(parse(fixture('empty')).jobs, []); assert.equal(parse(fixture('last')).hasNext, false);
  for (const html of [fixture('broken'), '<html>OK</html>', fixture('normal').replace(/__ga4_job_title/g, 'changed'), fixture('empty').replace('Trenutno nema oglasa po traženim kriterijumima pretrage.', '')]) assert.throws(() => parse(html), e => e.category === 'broken-markup');
  assert.throws(() => parse(fixture('access')), e => e.category === 'access');
});
test('URL and pagination validation prevents host/query/path drift and nonadvancing offsets', () => {
  assertRequestUrl(url); assertRequestUrl('https://www.helloworld.rs/oglasi-za-posao/stranica/30?q=Python');
  for (const target of ['http://www.helloworld.rs/oglasi-za-posao', 'https://www.helloworld.rs/posao/Foo/Bar/1', 'https://evil.example/oglasi-za-posao']) assert.throws(() => assertRequestUrl(target));
  for (const change of [s => s.replace('/stranica/30', '/stranica/0'), s => s.replace('/stranica/30', '/stranica/60'), s => s.replace('q=Data+Engineer', 'q=Python'), s => s.replace('https://www.helloworld.rs/oglasi', 'https://evil.example/oglasi'), s => s.replace('disable_saved_search=0', 'tag=69')]) assert.throws(() => parse(change(fixture('normal'))), e => e.category === 'broken-markup');
  assert.throws(() => parse(fixture('last').replace('/posao/', 'https://evil.example/posao/')), e => e.category === 'broken-markup');
  assert.equal(jobUrl('/posao/Title/Company/123?q=x#foo', 'helloworld-rs'), 'https://www.helloworld.rs/posao/Title/Company/123');
});
test('config is opt-in, requires queries and preserves legacy order lengths', () => {
  assert.deepEqual(parseConfig({ ru_market: {} }).selected, DEFAULT_SOURCES);
  for (const n of [2, 4, 5, 6]) assert.deepEqual(parseConfig({ ru_market: { primary_source_order: SOURCES.slice(0, n) } }).order, SOURCES);
  for (const n of [3, 7]) assert.throws(() => parseConfig({ ru_market: { primary_source_order: ['hh', ...SOURCES].slice(0, n) } }), e => e.category === 'config');
  for (const patch of [{ queries: undefined }, { queries: [] }, { queries: [''] }, { queries: ['a'.repeat(501)] }, { mode: 'api' }, { per_page: 20 }]) assert.throws(() => parseConfig(entry(patch)));
  assert.deepEqual(parseConfig(entry({ queries: [' Python ', 'Python'], mode: 'auto' })).sources['helloworld-rs'].queries, ['Python']);
});
test('pagination, direct plugin contract, query union and page-limit diagnostic', async () => {
  const requests = [];
  const jobs = await plugin.provider.fetch(entry({ queries: ['Data Engineer', 'Python'], max_pages: 2 }), { fetchText: async target => {
    requests.push(target); const u = new URL(target);
    const html = u.pathname.includes('/stranica/') ? fixture('last') : fixture('normal').replace('q=Data+Engineer', `q=${u.searchParams.get('q').replaceAll(' ', '+')}`);
    return u.searchParams.get('q') === 'Python' ? html.replace('/Data-Engineer/Bel-Dev-d.o.o/760224', '/Renamed/Bel-Dev-d.o.o/760224') : html;
  } });
  assert.equal(requests.length, 4); assert.equal(jobs.length, 5); assert.equal(jobs[0].matchedQueries.length, 2);
  assert.deepEqual(jobs[0].seniority.levels, ['senior']); assert(jobs[0].skills.includes('Python'));
  assert.equal(jobs.sourceStatuses[0].status, 'ok'); assert.equal(jobs.queryStatuses[0].stop_reason, 'exhausted');
  const limited = await fetchHelloWorld({ queries: ['Data Engineer'], max_pages: 1 }, { fetchText: async () => fixture('normal') });
  assert.equal(limited.queryStatuses[0].stop_reason, 'page-limit');
});
test('partial failures preserve jobs; access stops remaining queries; repeated pages fail', async () => {
  for (const category of ['broken-markup', 'access']) {
    let calls = 0;
    const jobs = await fetchHelloWorld({ queries: ['Data Engineer', 'Python'], max_pages: 2 }, { fetchText: async () => {
      calls++; if (calls === 1) return fixture('normal'); throw Object.assign(new Error('fixture'), { category });
    } }, { retries: 0 });
    assert.equal(jobs.length, 4); assert.equal(jobs.sourceStatus.status, 'partial');
    assert.equal(jobs.queryStatuses[1].status, category === 'access' ? 'skipped' : 'failed');
    assert.equal(calls, category === 'access' ? 2 : 3);
  }
  const repeated = await fetchHelloWorld({ queries: ['Data Engineer'], max_pages: 2 }, { fetchText: async target => fixture('normal').replace('/stranica/30', new URL(target).pathname.includes('/stranica/') ? '/stranica/60' : '/stranica/30') });
  assert.equal(repeated.sourceStatus.category, 'broken-markup'); assert.equal(repeated.length, 4);
});
test('health uses one explicit query, one request and zero retries', async () => {
  let calls = 0;
  const result = await checkHealth({ fetchText: async target => { calls++; assert.equal(new URL(target).searchParams.get('q'), 'Python'); return fixture('last'); } }, { source: 'helloworld-rs' });
  assert.equal(calls, 1); assert.equal(result.ok, true);
  calls = 0;
  const failed = await checkHealth({ fetchText: async () => { calls++; throw Object.assign(new Error('fixture'), { status: 503 }); } }, { source: 'helloworld-rs' });
  assert.equal(calls, 1); assert.equal(failed.ok, false);
});
let failures = 0;
for (const { name, run } of tests) { try { await run(); console.log(`ok - HelloWorld: ${name}`); } catch (error) { failures++; console.error(`FAIL - HelloWorld: ${name}`, error); } }
if (failures) process.exitCode = 1;
