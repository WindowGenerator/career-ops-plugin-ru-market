import assert from 'node:assert';
import { parsePage } from '../lib/processors/page-pipeline.mjs';
import { SourceError } from '../lib/errors.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const values = (id, extra = {}) => ({ title: `Job ${id}`, url: `https://career.habr.com/vacancies/${id}`, ...extra });
const adapter = (extract, extra = {}) => ({
  source: 'habr-career', noValid: 'no valid vacancies', extract, values: item => item, ...extra,
});

test('maps items through makeJob and passes hasNext through', () => {
  const page = parsePage(adapter(() => ({ items: [values(1), values(2)], hasNext: true })), 'raw');
  assert.deepStrictEqual(page.jobs.map(job => job.sourceId), ['1', '2']);
  assert.strictEqual(page.jobs[0].source, 'habr-career');
  assert.strictEqual(page.hasNext, true);
});

test('passes the raw response and the context to extract and values', () => {
  const seen = [];
  const ctx = { url: 'u' };
  parsePage(adapter(
    (...args) => { seen.push(args); return { items: [{ id: 1 }], hasNext: false }; },
    { values: (item, c) => { seen.push([item, c]); return values(item.id); } },
  ), 'raw', ctx);
  assert.deepStrictEqual(seen, [['raw', ctx], [{ id: 1 }, ctx]]);
});

test('empty items are a valid empty page', () => {
  const page = parsePage(adapter(() => ({ items: [], hasNext: false })), 'raw');
  assert.deepStrictEqual(page, { jobs: [], hasNext: false });
});

test('access and shape errors thrown by extract propagate unchanged', () => {
  const error = new SourceError('access', 'Challenge or login wall');
  assert.throws(() => parsePage(adapter(() => { throw error; }), 'raw'), e => e === error);
});

test('null items and items rejected by makeJob are dropped', () => {
  const page = parsePage(adapter(() => ({
    items: [
      null,
      values(1),
      { title: '', url: 'https://career.habr.com/vacancies/9' },
      values(2, { url: 'https://evil.example/x' }),
    ],
    hasNext: false,
  })), 'raw');
  assert.deepStrictEqual(page.jobs.map(job => job.sourceId), ['1']);
});

test('items that all fail are broken markup with the adapter message', () => {
  assert.throws(
    () => parsePage(adapter(() => ({ items: [null, { title: '' }], hasNext: false })), 'raw'),
    e => e.category === 'broken-markup' && e.message === 'no valid vacancies',
  );
});

test('duplicates inside one page are merged', () => {
  const page = parsePage(adapter(() => ({ items: [values(1), values(1), values(2)], hasNext: false })), 'raw');
  assert.strictEqual(page.jobs.length, 2);
});

test('values returning null drops the item', () => {
  const page = parsePage(adapter(
    () => ({ items: [1, 2], hasNext: false }),
    { values: n => (n === 1 ? null : values(n)) },
  ), 'raw');
  assert.deepStrictEqual(page.jobs.map(job => job.sourceId), ['2']);
});

test('hasNext and extras are read after the items are mapped', () => {
  const order = [];
  const page = parsePage(adapter(
    () => ({ items: [1], get hasNext() { order.push('hasNext'); return true; } }),
    { values: n => { order.push('values'); return values(n); } },
  ), 'raw');
  assert.deepStrictEqual(order, ['values', 'hasNext']);
  assert.strictEqual(page.hasNext, true);
});

test('extra keys returned by extract are carried to the result', () => {
  const page = parsePage(adapter(() => ({ items: [values(1)], hasNext: true, ids: [1], nextOffset: 20 })), 'raw');
  assert.deepStrictEqual(page.ids, [1]);
  assert.strictEqual(page.nextOffset, 20);
});

test('hasNext is coerced to a boolean', () => {
  assert.strictEqual(parsePage(adapter(() => ({ items: [], hasNext: undefined })), 'raw').hasNext, false);
  assert.strictEqual(parsePage(adapter(() => ({ items: [], hasNext: 'url' })), 'raw').hasNext, true);
});

test('finish runs on every makeJob result and may amend the job', () => {
  const page = parsePage(adapter(
    () => ({ items: [values(1, { flag: true }), values(2)], hasNext: false }),
    { finish: (job, item) => { if (item.flag) job.note += '; flagged'; return job; } },
  ), 'raw');
  assert.strictEqual(page.jobs[0].note, 'source: habr-career; flagged');
  assert.strictEqual(page.jobs[1].note, 'source: habr-career');
});

test('refine may reject a job by throwing, and sees null for invalid items', () => {
  const seen = [];
  assert.throws(() => parsePage(adapter(
    () => ({ items: [{ title: '' }], hasNext: false }),
    { finish: job => { seen.push(job); throw new SourceError('broken-markup', 'Invalid identity'); } },
  ), 'raw'), /Invalid identity/);
  assert.deepStrictEqual(seen, [null]);
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`FAIL - ${name}`, error); }
}
console.log(`${tests.length - failures}/${tests.length} page-pipeline tests passed`);
process.exitCode = failures ? 1 : 0;
