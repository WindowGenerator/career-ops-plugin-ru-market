// Runs against a core checkout with companion/core-contract.patch applied (CAREER_OPS_ROOT).
import { strict as assert } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.env.CAREER_OPS_ROOT ?? '../career-ops');
const load = path => import(pathToFileURL(resolve(root, path)).href);
const { default: parser } = await load('providers/local-parser.mjs');
const { buildTrustValidator } = await load('providers/_trust-validator.mjs');
const { buildSalaryFilter } = await load('scan.mjs');

const job = (extra = {}) => ({ title: 'Python', url: 'https://hh.ru/vacancy/1', company: 'hh', source: 'hh', ...extra });
const through = async jobs => {
  mkdirSync(resolve(root, 'scripts/ru-market'), { recursive: true });
  writeFileSync(resolve(root, 'scripts/ru-market/patch-jobs.mjs'), `console.log(${JSON.stringify(JSON.stringify({ jobs }))});\n`);
  return parser.fetch({ name: 'x', careers_url: 'https://hh.ru', parser: { command: 'node', script: 'scripts/ru-market/patch-jobs.mjs' } });
};
const labels = { values: ['full'], rawLabels: ['Полная занятость'] };

const [full, partial, bad, legacy, noSalary] = await through([
  job({ employment: labels, professional_role: { values: [], rawLabels: ['IT'] }, injectionFlags: ['conceal', 'ignore-previous', 'Bad Flag', 5], salary: { min: 100000, max: 200000, currency: 'RUB' } }),
  job({ url: 'https://hh.ru/vacancy/2', salary: { min: 90000, currency: 'RUB' } }),
  job({ url: 'https://hh.ru/vacancy/3', employment: { values: [1], rawLabels: [] }, professional_role: 'x', injectionFlags: 'conceal', salary: { min: 9, max: 1, currency: 'RUB' } }),
  job({ url: 'https://hh.ru/vacancy/4', salary: { from: 100, to: 200, currency: 'USD' } }),
  job({ url: 'https://hh.ru/vacancy/5' }),
]);
// Criterion 5: new fields reach core through local-parser; malformed shapes are dropped.
assert.deepEqual(full.employment, labels);
assert.deepEqual(full.professional_role, { values: [], rawLabels: ['IT'] });
assert.deepEqual(full.injectionFlags, ['conceal', 'ignore-previous']);
for (const key of ['employment', 'professional_role', 'injectionFlags', 'salary']) assert(!(key in bad), key);
assert(!('employment' in noSalary) && !('injectionFlags' in noSalary));
// Criterion 11: {min,max,currency} survives; legacy {from,to} is mapped; salary_filter uses it without compensation.
assert.deepEqual(full.salary, { currency: 'RUB', min: 100000, max: 200000 });
assert.deepEqual(partial.salary, { currency: 'RUB', min: 90000 });
assert.deepEqual(legacy.salary, { currency: 'USD', min: 100, max: 200 });
assert.equal(buildSalaryFilter({ min: 300000, currency: 'RUB' })(full.salary, undefined), false);
assert.equal(buildSalaryFilter({ min: 150000, currency: 'RUB' })(full.salary, undefined), true);
assert.equal(buildSalaryFilter({ min: 300000, currency: 'RUB' })(partial.salary, undefined), false);
assert.equal(buildSalaryFilter({ max: 50000, currency: 'RUB' })(partial.salary, undefined), false);
// Criterion 14: one flag and one -30 per job regardless of pattern count; disabled filter is a no-op; the field stays in the Job.
const validate = buildTrustValidator({ enabled: true });
const base = validate({ url: 'https://hh.ru/vacancy/1', company: 'hh' });
assert.deepEqual(base, { score: 100, flags: [], level: 'high' });
for (const injectionFlags of [['conceal'], ['conceal', 'ignore-previous', 'tool-call', 'role-marker']]) {
  const result = validate({ url: 'https://hh.ru/vacancy/1', company: 'hh', injectionFlags });
  assert.equal(result.score, 70); assert.deepEqual(result.flags, ['prompt-injection-suspected']); assert.equal(result.level, 'medium');
}
const mismatch = validate({ url: 'https://hh.ru/vacancy/1', company: 'Unrelated Corp', injectionFlags: ['conceal'] });
assert.equal(mismatch.score, 55); assert.deepEqual(mismatch.flags, ['company_domain_mismatch', 'prompt-injection-suspected']);
for (const invalid of [{ url: '' }, { url: 'not a url' }]) {
  const result = validate({ ...invalid, injectionFlags: ['conceal'] });
  assert(result.flags.includes('prompt-injection-suspected') && result.flags.length === 2 && result.score === validate(invalid).score - 30);
}
for (const none of [[], [''], 'conceal', undefined]) assert.deepEqual(validate({ url: 'https://hh.ru/vacancy/1', company: 'hh', injectionFlags: none }), base);
assert.deepEqual(buildTrustValidator({ enabled: false })({ url: '', injectionFlags: ['conceal'] }), { score: 100, flags: [], level: 'high' });
assert.deepEqual(buildTrustValidator(undefined)({ injectionFlags: ['conceal'] }), { score: 100, flags: [], level: 'high' });
console.log('core patch: local-parser fields, salary shape and prompt-injection trust rule OK');
