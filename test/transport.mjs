import assert from 'node:assert';
import { assertRequestUrl, request, USER_AGENT } from '../lib/transport/http.mjs';
import { createQueue, enqueue } from '../lib/transport/queue.mjs';
import { retryAfterMs, withRetry } from '../lib/transport/retry.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const forbidden = e => e.category === 'access';

test('assertRequestUrl: every public listing endpoint is accepted and returned as a URL', () => {
  for (const url of [
    'https://career.habr.com/vacancies',
    'https://career.habr.com/vacancies/backend_developer/remote?page=2',
    'https://geekjob.ru/vacancies/',
    'https://geekjob.ru/vacancies/12',
    'https://api.superjob.ru/2.0/vacancies/?keyword=a',
    'https://www.helloworld.rs/oglasi-za-posao?q=Python',
    'https://www.helloworld.rs/oglasi-za-posao/stranica/30?q=Python',
    'https://getmatch.ru/api/offers?limit=1',
    'https://opendata.trudvsem.ru/api/v1/vacancies?limit=1',
  ]) assert(assertRequestUrl(url) instanceof URL, url);
});

test('assertRequestUrl: other paths, hosts, schemes, ports and credentials are access errors', () => {
  for (const url of [
    'https://career.habr.com/companies',
    'https://geekjob.ru/vacancy/abc',
    'https://api.superjob.ru/2.0/vacancies',
    'https://www.helloworld.rs/oglasi-za-posao/stranica/01',
    'https://getmatch.ru/api/offers/1',
    'https://opendata.trudvsem.ru/api/v1/vacancies/x',
    'https://example.com/vacancies',
    'https://constructor/vacancies',
    'http://career.habr.com/vacancies',
    'https://career.habr.com:8443/vacancies',
    'https://user:pass@career.habr.com/vacancies',
  ]) assert.throws(() => assertRequestUrl(url), forbidden, url);
  assert.throws(() => assertRequestUrl('not a url'), TypeError);
});

test('request: sends the plugin User-Agent with a text Accept header through ctx.fetchText', async () => {
  const calls = [];
  const ctx = {
    fetchText: async (url, init) => {
      calls.push({ url, init });
      return '<html></html>';
    },
  };
  const body = await request(ctx, 'https://career.habr.com/vacancies', 'text', { retries: 0 });
  assert.strictEqual(body, '<html></html>');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://career.habr.com/vacancies');
  const headers = { 'User-Agent': USER_AGENT, Accept: 'text/html' };
  assert.deepStrictEqual(calls[0].init, { headers, timeoutMs: 10_000 });
});

test('request: json kind uses ctx.fetchJson and an application/json Accept header', async () => {
  const calls = [];
  const ctx = { fetchJson: async (url, init) => { calls.push(init); return { ok: true }; } };
  const url = 'https://getmatch.ru/api/offers?limit=1';
  assert.deepStrictEqual(await request(ctx, url, 'json', { retries: 0 }), { ok: true });
  assert.strictEqual(calls[0].headers.Accept, 'application/json');
  assert.strictEqual('X-Api-App-Id' in calls[0].headers, false);
});

test('request: SuperJob requires a printable-ASCII API key and sends it as X-Api-App-Id', async () => {
  const badEnvs = [undefined, {}, { SUPERJOB_API_KEY: '' }, { SUPERJOB_API_KEY: 'has space' }, { SUPERJOB_API_KEY: 5 }];
  for (const env of badEnvs) {
    await assert.rejects(
      request({ env, fetchJson: async () => ({}) }, 'https://api.superjob.ru/2.0/vacancies/', 'json'),
      e => e.category === 'config',
    );
  }
  const seen = [];
  const ctx = {
    env: { SUPERJOB_API_KEY: 'v3.r.key' },
    fetchJson: async (url, init) => {
      seen.push(init.headers);
      return {};
    },
  };
  await request(ctx, 'https://api.superjob.ru/2.0/vacancies/', 'json', { retries: 0 });
  assert.strictEqual(seen[0]['X-Api-App-Id'], 'v3.r.key');
});

test('request: rejects forbidden URLs before calling the context', async () => {
  let called = false;
  const ctx = { fetchText: async () => { called = true; return ''; } };
  await assert.rejects(request(ctx, 'https://career.habr.com/users', 'text'), forbidden);
  assert.strictEqual(called, false);
});

test('request: retries=0 passes the first failure through unchanged', async () => {
  let calls = 0;
  const error = Object.assign(new Error('HTTP 503'), { status: 503 });
  const ctx = { fetchJson: async () => { calls++; throw error; } };
  const url = 'https://opendata.trudvsem.ru/api/v1/vacancies';
  await assert.rejects(request(ctx, url, 'json', { retries: 0 }), e => e === error);
  assert.strictEqual(calls, 1);
});

test('retryAfterMs: no hint, seconds, HTTP date, headers shapes and the 10 second cap', () => {
  assert.strictEqual(retryAfterMs({}), 0);
  assert.strictEqual(retryAfterMs(undefined), 0);
  assert.strictEqual(retryAfterMs({ retryAfter: '' }), 0);
  assert.strictEqual(retryAfterMs({ retryAfter: 2 }), 2000);
  assert.strictEqual(retryAfterMs({ retryAfter: '3' }), 3000);
  assert.strictEqual(retryAfterMs({ retryAfter: 999 }), 10_000);
  assert.strictEqual(retryAfterMs({ retryAfter: -5 }), 0);
  assert.strictEqual(retryAfterMs({ headers: { 'retry-after': '4' } }), 4000);
  assert.strictEqual(retryAfterMs({ response: { headers: new Headers({ 'retry-after': '5' }) } }), 5000);
  assert.strictEqual(retryAfterMs({ headers: new Headers({ 'Retry-After': '6' }) }), 6000);
  assert.strictEqual(retryAfterMs({ retryAfter: 'Thu, 01 Jan 1970 00:00:03 GMT' }, 1000), 2000);
  assert.strictEqual(retryAfterMs({ retryAfter: 'Thu, 01 Jan 1970 00:00:03 GMT' }, 9000), 0);
  assert.strictEqual(retryAfterMs({ retryAfter: 'garbage' }), 0);
});

test('withRetry: backoff doubles, is capped at 5 seconds and honours a longer Retry-After', async () => {
  const delays = [];
  let calls = 0;
  const error = Object.assign(new Error('HTTP 503'), { status: 503, retryAfter: 4 });
  await assert.rejects(
    withRetry(
      async () => { calls++; throw error; },
      { retries: 3, wait: async ms => delays.push(ms), random: () => 0 },
    ),
    e => e === error,
  );
  assert.strictEqual(calls, 4);
  assert.deepStrictEqual(delays, [4000, 4000, 4000]);
  const plain = [];
  await assert.rejects(withRetry(async () => { throw new TypeError('fetch failed'); },
    { retries: 6, wait: async ms => plain.push(ms), random: () => 0.999 }));
  assert.deepStrictEqual(plain, [749, 1249, 2249, 4249, 5000, 5000]);
});

test('withRetry: non-retryable categories are thrown immediately', async () => {
  let calls = 0;
  const notFound = Object.assign(new Error('HTTP 404'), { status: 404 });
  await assert.rejects(withRetry(async () => { calls++; throw notFound; }, { wait: async () => {} }));
  assert.strictEqual(calls, 1);
});

test('createQueue: spaces starts by spacingMs and honours the concurrency limit', async () => {
  let now = 1000;
  const starts = [];
  const queue = createQueue({ concurrency: 1, spacingMs: 100, now: () => now, wait: async ms => { now += ms; } });
  await Promise.all([1, 2, 3].map(n => queue(async () => { starts.push([n, now]); })));
  assert.deepStrictEqual(starts.map(s => s[0]), [1, 2, 3]);
  assert.deepStrictEqual(starts.map(s => s[1]), [1000, 1100, 1200]);
});

test('createQueue: resolves with the task value and rejects with the task error', async () => {
  const queue = createQueue({ spacingMs: 0, wait: async () => {} });
  assert.strictEqual(await queue(async () => 'value'), 'value');
  const failure = new Error('task failed');
  await assert.rejects(queue(async () => { throw failure; }), e => e === failure);
  assert.strictEqual(await queue(() => 'sync'), 'sync');
});

test('enqueue: every allowlisted host has a queue and unknown hosts are refused', async () => {
  const hosts = [
    'career.habr.com', 'geekjob.ru', 'api.superjob.ru',
    'opendata.trudvsem.ru', 'www.helloworld.rs', 'getmatch.ru',
  ];
  for (const host of hosts) {
    assert.strictEqual(await enqueue(host, async () => host), host);
  }
  assert.throws(() => enqueue('example.com', async () => {}), /Unsupported request host: example\.com/);
});

test('legacy: queue host list is a second copy of the http allowlist and must be kept in sync by hand', () => {
  // assertRequestUrl accepts exactly the hosts that enqueue has queues for; nothing enforces it.
  assert.throws(() => enqueue('api.hh.ru', async () => {}), /Unsupported request host/);
  assert.throws(() => assertRequestUrl('https://api.hh.ru/vacancies'), forbidden);
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`FAIL - ${name}`, error); }
}
console.log(`${tests.length - failures}/${tests.length} transport tests passed`);
process.exitCode = failures ? 1 : 0;
