import assert from 'node:assert';
import { parseSalary, structuredSalary } from '../lib/processors/normalize.mjs';
import {
  compensationFromSalary, compensationMatchesFilter, formatExplicitCompensation,
  normalizeCompensation, parseCompensation,
} from '../lib/processors/compensation.mjs';
import { confidence, deduplicate, localDedup, sourceOf } from '../lib/processors/dedup.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const DAY = 86400_000;
const words = count => Array.from({ length: count }, (_, i) => `word${i}`).join(' ');
const job = (source, id, extra = {}) => ({
  title: 'Python Developer', company: 'Acme', location: 'Москва',
  url: source === 'getmatch' ? `https://getmatch.ru/vacancies/${id}-python` : `https://example.test/${source}/${id}`,
  description: words(20), note: `source: ${source}`, ...extra,
});

// --- salary parsing -------------------------------------------------------

test('structuredSalary: accepts min/max or from/to aliases and maps RUR to RUB', () => {
  const converted = structuredSalary({ from: 10, to: 20, currency: 'RUR' });
  assert.deepStrictEqual(converted, { currency: 'RUB', min: 10, max: 20 });
  assert.deepStrictEqual(structuredSalary({ min: 5, currency: 'USD' }), { currency: 'USD', min: 5 });
  assert.deepStrictEqual(structuredSalary({ to: 7, currency: 'EUR' }), { currency: 'EUR', max: 7 });
});

test('structuredSalary: rejects bad shapes, currencies, amounts and inverted ranges', () => {
  assert.strictEqual(structuredSalary(undefined), undefined);
  assert.strictEqual(structuredSalary('100'), undefined);
  assert.strictEqual(structuredSalary({ min: 1 }), undefined);
  assert.strictEqual(structuredSalary({ min: 1, currency: 'usd' }), undefined);
  assert.strictEqual(structuredSalary({ currency: 'USD' }), undefined);
  assert.strictEqual(structuredSalary({ min: -1, currency: 'USD' }), undefined);
  assert.strictEqual(structuredSalary({ min: NaN, currency: 'USD' }), undefined);
  assert.strictEqual(structuredSalary({ min: 9, max: 3, currency: 'USD' }), undefined);
});

test('parseSalary: ranges, open bounds, single amounts and thousand suffixes', () => {
  assert.deepStrictEqual(parseSalary('от 100 000 до 200 000 ₽'), { min: 100000, max: 200000, currency: 'RUB' });
  assert.deepStrictEqual(parseSalary('от 150 000 ₽'), { min: 150000, currency: 'RUB' });
  assert.deepStrictEqual(parseSalary('до 150 000 ₽'), { max: 150000, currency: 'RUB' });
  assert.deepStrictEqual(parseSalary('150 000 ₽'), { min: 150000, max: 150000, currency: 'RUB' });
  assert.deepStrictEqual(parseSalary('from 3k USD'), { min: 3000, currency: 'USD' });
  assert.deepStrictEqual(parseSalary('200 тыс. руб.'), { min: 200000, max: 200000, currency: 'RUB' });
  assert.deepStrictEqual(parseSalary('1,5k €'), { min: 1500, max: 1500, currency: 'EUR' });
});

test('parseSalary: non-breaking space thousands separators and other currencies', () => {
  assert.deepStrictEqual(parseSalary('от 100 000 ₸'), { min: 100000, currency: 'KZT' });
  assert.deepStrictEqual(parseSalary('50 BYN'), { min: 50, max: 50, currency: 'BYN' });
});

test('parseSalary: refuses estimates, missing currency, no amounts and more than two amounts', () => {
  assert.strictEqual(parseSalary('Зарплата не указана'), undefined);
  assert.strictEqual(parseSalary('По договорённости'), undefined);
  assert.strictEqual(parseSalary('Прогноз 100 000 ₽'), undefined);
  assert.strictEqual(parseSalary('100 000'), undefined);
  assert.strictEqual(parseSalary('₽'), undefined);
  assert.strictEqual(parseSalary('1 2 3 ₽'), undefined);
  assert.strictEqual(parseSalary(undefined), undefined);
  assert.strictEqual(parseSalary('200 000 – 100 000 ₽'), undefined);
});

// --- compensation ---------------------------------------------------------

test('normalizeCompensation: non-objects are undefined, defaults are explicit unknowns', () => {
  for (const value of [undefined, null, 'text', 5, []]) assert.strictEqual(normalizeCompensation(value), undefined);
  assert.deepStrictEqual(normalizeCompensation({}), { period: 'unknown', taxBasis: 'unknown', rawText: '' });
});

test('normalizeCompensation: maps RUR to RUB and keeps valid amounts', () => {
  assert.deepStrictEqual(
    normalizeCompensation({ period: 'month', taxBasis: 'net', rawText: ' 1  ', currency: 'RUR', min: 1, max: 2 }),
    { period: 'month', taxBasis: 'net', rawText: '1', currency: 'RUB', min: 1, max: 2 },
  );
});

test('normalizeCompensation: invalid amounts, inverted ranges or no currency give a diagnostic', () => {
  const diagnostic = 'invalid-amount-or-currency';
  assert.strictEqual(normalizeCompensation({ currency: 'RUB', min: 9, max: 3 }).diagnostic, diagnostic);
  assert.strictEqual(normalizeCompensation({ min: 1 }).diagnostic, diagnostic);
  assert.strictEqual(normalizeCompensation({ currency: 'RUB', min: -1 }).diagnostic, diagnostic);
  assert.strictEqual(normalizeCompensation({ currency: 'RUB', min: '1' }).diagnostic, diagnostic);
  assert.strictEqual('min' in normalizeCompensation({ currency: 'RUB', min: 9, max: 3 }), false);
  assert.strictEqual(normalizeCompensation({ currency: 'rub', period: 'week', taxBasis: 'x' }).period, 'unknown');
});

test('normalizeCompensation: an explicit string diagnostic overrides the computed one', () => {
  assert.strictEqual(normalizeCompensation({ min: 1, diagnostic: 'custom' }).diagnostic, 'custom');
});

test('parseCompensation: amounts, period, tax basis and open bounds', () => {
  assert.deepStrictEqual(parseCompensation('от 100 000 ₽ в месяц на руки'), {
    rawText: 'от 100 000 ₽ в месяц на руки',
    period: 'month', taxBasis: 'net', currency: 'RUB', min: 100000,
  });
  assert.deepStrictEqual(parseCompensation('до 5 000 $ per year gross'), {
    rawText: 'до 5 000 $ per year gross', period: 'year', taxBasis: 'gross', currency: 'USD', max: 5000,
  });
  assert.strictEqual(parseCompensation('100–200 тыс. ₽ за смену').period, 'shift');
  assert.deepStrictEqual(parseCompensation('50 EUR per hour').period, 'hour');
  const exact = parseCompensation('50 000 ₽');
  assert.strictEqual(exact.min, 50000);
  assert.strictEqual(exact.max, 50000);
});

test('legacy: parseCompensation applies a thousands suffix only to the amount it follows', () => {
  // "100–200 тыс." means 100 000 - 200 000 to a reader but parses as 100 and 200 000.
  const result = parseCompensation('100–200 тыс. ₽ за смену');
  assert.strictEqual(result.min, 100);
  assert.strictEqual(result.max, 200000);
});

test('parseCompensation: empty is undefined, a currency hint is used and RUR becomes RUB', () => {
  assert.strictEqual(parseCompensation(''), undefined);
  assert.strictEqual(parseCompensation(undefined), undefined);
  assert.strictEqual(parseCompensation('100 USD', 'RUR').diagnostic, 'ambiguous-amount-or-currency');
  assert.strictEqual(parseCompensation('100 RUB', 'RUR').currency, 'RUB');
});

test('parseCompensation: ambiguous or unsupported text keeps rawText with a diagnostic', () => {
  const ambiguous = parseCompensation('по договорённости');
  assert.strictEqual(ambiguous.diagnostic, 'ambiguous-amount-or-currency');
  assert.strictEqual(parseCompensation('100 000 ₽ прогноз').diagnostic, 'ambiguous-amount-or-currency');
  assert.strictEqual(parseCompensation('100 000 ₽ в неделю').diagnostic, 'unsupported-period');
  assert.strictEqual('min' in parseCompensation('по договорённости'), false);
});

test('compensationFromSalary: combines structured amounts with units found in the text', () => {
  const result = compensationFromSalary({ min: 1, max: 2, currency: 'RUB' }, '1 ₽ в месяц на руки');
  assert.strictEqual(result.period, 'month');
  assert.strictEqual(result.taxBasis, 'net');
  assert.strictEqual(result.currency, 'RUB');
  assert.strictEqual(result.min, 1);
  assert.strictEqual(result.max, 2);
});

test('compensationFromSalary: explicit period and basis arguments are used when the text has none', () => {
  const result = compensationFromSalary({ min: 1, currency: 'USD' }, 'text', 'year', 'gross');
  assert.strictEqual(result.period, 'year');
  assert.strictEqual(result.taxBasis, 'gross');
  assert.strictEqual('max' in result, false);
  assert.strictEqual(compensationFromSalary(undefined).diagnostic, undefined);
});

test('legacy: compensationFromSalary prefers the period found in the text over the argument', () => {
  // text?.period !== 'unknown' ? text?.period ?? period : period
  assert.strictEqual(compensationFromSalary({ min: 1, currency: 'USD' }, '1 USD per hour', 'year').period, 'hour');
  assert.strictEqual(compensationFromSalary({ min: 1, currency: 'USD' }, '', 'year').period, 'year');
});

const filter = { currency: 'RUB', period: 'month', taxBasis: 'net' };
const comp = (extra = {}) => ({ currency: 'RUB', period: 'month', taxBasis: 'net', min: 100, max: 200, ...extra });

test('compensationMatchesFilter: range overlap against min and max', () => {
  assert.strictEqual(compensationMatchesFilter(comp(), { ...filter, min: 150 }), true);
  assert.strictEqual(compensationMatchesFilter(comp(), { ...filter, min: 250 }), false);
  assert.strictEqual(compensationMatchesFilter(comp(), { ...filter, max: 50 }), false);
  assert.strictEqual(compensationMatchesFilter(comp(), { ...filter, max: 150 }), true);
  assert.strictEqual(compensationMatchesFilter(comp({ max: undefined }), { ...filter, min: 9999 }), true);
  assert.strictEqual(compensationMatchesFilter(comp({ min: undefined }), { ...filter, max: 5 }), true);
});

test('legacy: compensationMatchesFilter treats max 0 or unset as no upper bound', () => {
  assert.strictEqual(compensationMatchesFilter(comp(), { ...filter, max: 0 }), true);
  assert.strictEqual(compensationMatchesFilter(comp(), { ...filter }), true);
});

test('legacy: compensationMatchesFilter keeps the job on any unit mismatch or missing compensation', () => {
  const strict = { ...filter, min: 9999 };
  assert.strictEqual(compensationMatchesFilter(comp(), strict), false);
  assert.strictEqual(compensationMatchesFilter(comp({ currency: 'USD' }), strict), true);
  assert.strictEqual(compensationMatchesFilter(comp({ period: 'year' }), strict), true);
  assert.strictEqual(compensationMatchesFilter(comp({ taxBasis: 'gross' }), strict), true);
  assert.strictEqual(compensationMatchesFilter(comp({ period: 'unknown' }), strict), true);
  assert.strictEqual(compensationMatchesFilter(comp(), { ...strict, taxBasis: undefined }), true);
  assert.strictEqual(compensationMatchesFilter(comp(), { min: 9999, period: 'month', taxBasis: 'net' }), true);
  assert.strictEqual(compensationMatchesFilter(undefined, strict), true);
  assert.strictEqual(compensationMatchesFilter(comp(), { ...strict, currency: 'rub' }), false);
});

test('formatExplicitCompensation: ranges, open bounds, equal bounds and raw text fallback', () => {
  assert.strictEqual(formatExplicitCompensation(comp()), '100-200 RUB / month (net)');
  assert.strictEqual(formatExplicitCompensation(comp({ min: 5, max: 5 })), '5 RUB / month (net)');
  assert.strictEqual(formatExplicitCompensation(comp({ max: undefined })), 'from 100 RUB / month (net)');
  assert.strictEqual(formatExplicitCompensation(comp({ min: undefined })), 'up to 200 RUB / month (net)');
  assert.strictEqual(formatExplicitCompensation({ rawText: 'договорная' }), 'договорная');
  assert.strictEqual(formatExplicitCompensation(undefined), '');
});

// --- dedup ----------------------------------------------------------------

test('sourceOf: reads the source id from the note, empty when absent', () => {
  assert.strictEqual(sourceOf({ note: 'source: habr-career; salary: x' }), 'habr-career');
  assert.strictEqual(sourceOf({ note: 'other' }), '');
  assert.strictEqual(sourceOf({}), '');
});

test('localDedup: same posting is merged, matchedQueries are unioned by queryId, input is not mutated', () => {
  const a = job('habr-career', '1', { matchedQueries: [{ query: 'a', queryId: 'q1' }] });
  const b = job('habr-career', '1', {
    matchedQueries: [{ query: 'a', queryId: 'q1' }, { query: 'b', queryId: 'q2' }],
  });
  const result = localDedup([a, b, job('habr-career', '2')]);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result[0].matchedQueries.map(q => q.queryId), ['q1', 'q2']);
  assert.strictEqual(a.matchedQueries.length, 1);
  assert.notStrictEqual(result[0], a);
});

test('localDedup: identity is the last path segment, except getmatch which uses the numeric id', () => {
  const g1 = job('getmatch', '7');
  const g2 = { ...g1, url: 'https://getmatch.ru/vacancies/7-renamed-slug' };
  assert.strictEqual(localDedup([g1, g2]).length, 1);
  assert.strictEqual(localDedup([job('habr-career', '1'), job('geekjob', '1')]).length, 2);
});

test('legacy: a postedAt of 0 counts as missing in the date comparison', () => {
  const a = job('habr-career', '1', { description: 'short', postedAt: 0 });
  assert.strictEqual(confidence(a, job('geekjob', '1', { postedAt: 100 * DAY })), 'medium');
});

test('confidence: identical URL and getmatch identity are high', () => {
  assert.strictEqual(confidence(job('habr-career', '1'), job('habr-career', '1')), 'high');
  const g2 = { ...job('getmatch', '7'), url: 'https://getmatch.ru/vacancies/7-other' };
  assert.strictEqual(confidence(job('getmatch', '7'), g2), 'high');
});

test('confidence: different postings of one source are low', () => {
  assert.strictEqual(confidence(job('habr-career', '1'), job('habr-career', '2')), 'low');
});

test('confidence: cross-source needs same company (legal form ignored), title, location, date, salary', () => {
  // A short description keeps the comparison at 'medium' instead of 'high'.
  const a = job('habr-career', '1', { description: 'short' });
  assert.strictEqual(confidence(a, job('geekjob', '1', { company: 'ООО Acme' })), 'medium');
  assert.strictEqual(confidence(a, job('geekjob', '1', { company: 'Other' })), 'low');
  assert.strictEqual(confidence(a, job('geekjob', '1', { title: 'Java Developer' })), 'low');
  assert.strictEqual(confidence(a, job('geekjob', '1', { location: 'Казань' })), 'low');
  assert.strictEqual(confidence({ ...a, company: '' }, job('geekjob', '1')), 'low');
  assert.strictEqual(confidence({ ...a, postedAt: DAY }, job('geekjob', '1', { postedAt: 16 * DAY })), 'low');
  assert.strictEqual(confidence({ ...a, postedAt: DAY }, job('geekjob', '1', { postedAt: 15 * DAY })), 'medium');
  const usd = { currency: 'USD', min: 1 };
  const rubles = job('geekjob', '1', { salary: { currency: 'RUB', min: 1 } });
  assert.strictEqual(confidence({ ...a, salary: usd }, rubles), 'low');
  assert.strictEqual(confidence({ ...a, salary: { currency: 'RUB', min: 1, max: 5 } },
    job('geekjob', '1', { salary: { currency: 'RUB', min: 9 } })), 'low');
});

test('confidence: descriptions of 12+ distinct words are compared; similar ones with a location are high', () => {
  const text = words(20);
  const a = job('habr-career', '1', { description: text });
  assert.strictEqual(confidence(a, job('geekjob', '1', { description: text })), 'high');
  assert.strictEqual(confidence(a, job('geekjob', '1', { description: words(20).replace(/word/g, 'other') })), 'low');
  assert.strictEqual(confidence(a, job('geekjob', '1', { description: 'short text' })), 'medium');
  assert.strictEqual(confidence({ ...a, location: '' }, job('geekjob', '1', { description: text })), 'medium');
});

test('deduplicate: merges cross-listed jobs, keeps the first-ranked one and notes the others', () => {
  const result = deduplicate([job('geekjob', '9'), job('habr-career', '1')]);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(sourceOf(result[0]), 'habr-career');
  assert.strictEqual(result[0].note, 'source: habr-career; cross-listed: GeekJob https://example.test/geekjob/9');
});

test('deduplicate: a custom order decides which listing survives', () => {
  const result = deduplicate([job('habr-career', '1'), job('geekjob', '9')], ['geekjob', 'habr-career']);
  assert.strictEqual(sourceOf(result[0]), 'geekjob');
});

test('deduplicate: unions injection flags of merged jobs, sorted and unique', () => {
  const result = deduplicate([
    job('habr-career', '1', { injectionFlags: ['b'] }),
    job('geekjob', '9', { injectionFlags: ['c', 'a', 'b'] }),
  ]);
  assert.deepStrictEqual(result[0].injectionFlags, ['a', 'b', 'c']);
});

test('deduplicate: medium matches are annotated both ways without merging', () => {
  const a = job('habr-career', '1', { description: 'x' });
  const b = job('geekjob', '9', { location: '' });
  const result = deduplicate([a, b]);
  assert.strictEqual(result.length, 2);
  assert.match(result[0].note, /possible cross-listing: GeekJob https:\/\/example\.test\/geekjob\/9/);
  assert.match(result[1].note, /possible cross-listing: Habr Career https:\/\/example\.test\/habr-career\/1/);
});

test('deduplicate: does not mutate its input jobs', () => {
  const a = job('habr-career', '1');
  const b = job('geekjob', '9');
  deduplicate([a, b]);
  assert.strictEqual(a.note, 'source: habr-career');
});

test('legacy: label() has no entry for helloworld-rs so notes show the raw source id', () => {
  const result = deduplicate([job('habr-career', '1'), job('helloworld-rs', '5')], ['habr-career', 'helloworld-rs']);
  assert.match(result[0].note, /cross-listed: helloworld-rs https:\/\/example\.test\/helloworld-rs\/5$/);
  const merged = deduplicate([job('habr-career', '1'), job('trudvsem', '5')], ['habr-career', 'trudvsem']);
  assert.match(merged[0].note, /cross-listed: Работа России /);
});

test('legacy: salary notes are merged by splitting the donor note on "; salary: "', () => {
  const result = deduplicate([
    job('habr-career', '1'),
    job('geekjob', '9', { note: 'source: geekjob; salary: от 100 ₽; extra' }),
  ]);
  assert.strictEqual(result[0].note,
    'source: habr-career; cross-listed: GeekJob https://example.test/geekjob/9; GeekJob salary: от 100 ₽; extra');
});

test('legacy: an order list without the source ranks it first because indexOf is -1', () => {
  const result = deduplicate([job('habr-career', '1'), job('getmatch', '3')], ['habr-career']);
  assert.strictEqual(sourceOf(result[0]), 'getmatch');
  const defaultOrder = deduplicate([job('habr-career', '1'), job('superjob', '3')]);
  assert.strictEqual(sourceOf(defaultOrder[0]), 'superjob');
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - ${name}`); }
  catch (error) { failures++; console.error(`FAIL - ${name}`, error); }
}
console.log(`${tests.length - failures}/${tests.length} processor tests passed`);
process.exitCode = failures ? 1 : 0;
