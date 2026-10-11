import assert from 'node:assert';
import { clean, decode, plainText, normalizedText, normalizedCompany } from '../lib/processors/normalize.mjs';
import { SourceError, categoryOf } from '../lib/errors.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('clean: collapses whitespace, trims, and returns empty string for non-strings', () => {
  assert.strictEqual(clean('  a \n\t b  c  '), 'a b c');
  assert.strictEqual(clean(undefined), '');
  assert.strictEqual(clean(42), '');
  assert.strictEqual(clean(null), '');
});

test('decode: named, decimal and hex entities', () => {
  assert.strictEqual(decode('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;'), `a & b <c> "d" 'e'`);
  assert.strictEqual(decode('&laquo;x&raquo; &ndash; &mdash; &rub;'), '«x» – — ₽');
  assert.strictEqual(decode('&#65;&#x42;&#X43;'), 'ABC');
  assert.strictEqual(decode('&AMP;'), '&');
});

test('decode: unknown names and invalid code points stay as written', () => {
  assert.strictEqual(decode('&unknown; &#0; &#xD800; &#1114112;'), '&unknown; &#0; &#xD800; &#1114112;');
  assert.strictEqual(decode('no entities & here'), 'no entities & here');
  assert.strictEqual(decode(undefined), '');
  assert.strictEqual(decode(null), '');
});

test('decode: nbsp entity becomes an ordinary space', () => {
  assert.strictEqual(decode('a&nbsp;b'), 'a\x20b');
});

test('plainText: strips tags, script and style, decodes entities, collapses space', () => {
  const html = '<p>Hello&nbsp;<b>world</b></p><script>alert(1)</script><style>p{}</style>!';
  assert.strictEqual(plainText(html), 'Hello world !');
  assert.strictEqual(plainText(undefined), '');
  assert.strictEqual(plainText('a &lt;b&gt; c'), 'a <b> c');
});

test('normalizedText: NFKC, lower case, quotes and punctuation removed', () => {
  assert.strictEqual(normalizedText('  «Senior»  Python-Developer, (Remote)! '), 'senior python-developer remote');
  assert.strictEqual(normalizedText('ＡＢＣ'), 'abc');
  assert.strictEqual(normalizedText(undefined), '');
});

test('normalizedCompany: strips legal-form prefixes and suffixes', () => {
  assert.strictEqual(normalizedCompany('ООО Ромашка'), 'ромашка');
  assert.strictEqual(normalizedCompany('Ромашка ООО'), 'ромашка');
  assert.strictEqual(normalizedCompany('Acme LLC'), 'acme');
  assert.strictEqual(normalizedCompany('Acme Ltd'), 'acme');
  assert.strictEqual(normalizedCompany('Acme, Inc.'), 'acme');
  assert.strictEqual(normalizedCompany('Acme GmbH'), 'acme');
  assert.strictEqual(normalizedCompany('Acme Limited'), 'acme');
});

test('normalizedCompany: a name that is only a legal form is kept', () => {
  assert.strictEqual(normalizedCompany('ООО'), 'ооо');
  assert.strictEqual(normalizedCompany('ООО ООО'), 'ооо');
});

test('SourceError: carries category, message and cause', () => {
  const cause = new Error('root');
  const error = new SourceError('access', 'Blocked', { cause });
  assert(error instanceof Error);
  assert.strictEqual(error.name, 'SourceError');
  assert.strictEqual(error.category, 'access');
  assert.strictEqual(error.message, 'Blocked');
  assert.strictEqual(error.cause, cause);
});

test('categoryOf: explicit category wins over everything else', () => {
  assert.strictEqual(categoryOf(Object.assign(new Error('HTTP 500'), { category: 'config' })), 'config');
});

test('categoryOf: HTTP status from status, response.status or message', () => {
  assert.strictEqual(categoryOf({ status: 429 }), 'rate-limited');
  assert.strictEqual(categoryOf({ status: 401 }), 'access');
  assert.strictEqual(categoryOf({ response: { status: 403 } }), 'access');
  assert.strictEqual(categoryOf({ status: 503 }), 'server');
  assert.strictEqual(categoryOf({ status: 404 }), 'http');
  assert.strictEqual(categoryOf(new Error('Request failed: HTTP 502 bad gateway')), 'server');
  assert.strictEqual(categoryOf(new Error('http 418')), 'http');
});

test('categoryOf: SyntaxError is broken markup', () => {
  assert.strictEqual(categoryOf(new SyntaxError('Unexpected token')), 'broken-markup');
});

test('categoryOf: message patterns for access and network failures', () => {
  assert.strictEqual(categoryOf(new Error('captcha shown')), 'access');
  assert.strictEqual(categoryOf(new Error('egress blocked by policy')), 'access');
  assert.strictEqual(categoryOf(new Error('fetch failed')), 'network');
  assert.strictEqual(categoryOf(Object.assign(new Error('x'), { name: 'AbortError' })), 'network');
  assert.strictEqual(categoryOf(Object.assign(new Error('x'), { code: 'ECONNRESET' })), 'network');
  assert.strictEqual(categoryOf(Object.assign(new Error('x'), { code: 'OTHER' })), 'unknown');
});

test('categoryOf: nullish and unrecognised inputs are unknown', () => {
  assert.strictEqual(categoryOf(undefined), 'unknown');
  assert.strictEqual(categoryOf(null), 'unknown');
  assert.strictEqual(categoryOf(new Error('boom')), 'unknown');
});

test('legacy: status 0 or NaN does not classify as http, message patterns still apply', () => {
  assert.strictEqual(categoryOf({ status: 'abc', message: 'timeout while reading' }), 'network');
});

let failures = 0;
for (const { name, run } of tests) {
  try {
    await run();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL - ${name}`, error);
  }
}
console.log(`${tests.length - failures}/${tests.length} text tests passed`);
process.exitCode = failures ? 1 : 0;
