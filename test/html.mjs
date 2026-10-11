import assert from 'node:assert';
import { all, byClass, checkAccess, hasClass, hasNext, nodeText, parseHtml } from '../lib/helpers/html.mjs';

const tests = [];
const test = (name, run) => tests.push({ name, run });
const first = (root, tag) => all(root, n => n.tag === tag)[0];

test('parseHtml: builds a tree with lower-cased tags and attributes', () => {
  const root = parseHtml('<DIV Class="a b" data-x=\'1\' hidden><P>text</P></DIV>');
  const div = root.children[0];
  assert.strictEqual(div.tag, 'div');
  assert.deepStrictEqual(div.attrs, { class: 'a b', 'data-x': '1', hidden: '' });
  assert.strictEqual(div.children[0].tag, 'p');
  assert.deepStrictEqual(div.children[0].children, ['text']);
});

test('parseHtml: decodes entities in text and attribute values', () => {
  const root = parseHtml('<a href="/x?a=1&amp;b=2">A &amp; B</a>');
  const a = first(root, 'a');
  assert.strictEqual(a.attrs.href, '/x?a=1&b=2');
  assert.deepStrictEqual(a.children, ['A & B']);
});

test('parseHtml: void and self-closing tags do not swallow following siblings', () => {
  const root = parseHtml('<p>a<br>b<img src="x"><span/>c</p>');
  const p = first(root, 'p');
  const shape = p.children.map(c => (typeof c === 'string' ? c : c.tag));
  assert.deepStrictEqual(shape, ['a', 'br', 'b', 'img', 'span', 'c']);
});

test('parseHtml: unclosed tags are tolerated and closed by the nearest matching end tag', () => {
  const root = parseHtml('<div><p>one<p>two</div>after');
  const div = root.children[0];
  assert.strictEqual(div.tag, 'div');
  assert.strictEqual(root.children[1], 'after');
  assert.strictEqual(all(root, n => n.tag === 'p').length, 2);
});

test('parseHtml: a stray end tag is ignored', () => {
  const root = parseHtml('<div>a</span>b</div>');
  assert.deepStrictEqual(first(root, 'div').children, ['a', 'b']);
});

test('parseHtml: comments, script and style payloads are dropped', () => {
  const root = parseHtml('<p>a<!-- hidden <b>x</b> -->b<script>var x = "<p>evil</p>";</script><style>p{}</style>c</p>');
  assert.strictEqual(all(root, n => ['script', 'style', 'b'].includes(n.tag)).length, 0);
});

test('legacy: removed comments and scripts glue the surrounding text together', () => {
  // The payload is cut out before tokenizing, so "a", "b" and "c" become one text node.
  assert.strictEqual(nodeText(parseHtml('<p>a<!-- x -->b<script>1</script>c</p>')), 'abc');
});

test('parseHtml: non-string input is a broken-markup SourceError', () => {
  assert.throws(
    () => parseHtml(undefined),
    e => e.category === 'broken-markup',
  );
  assert.throws(
    () => parseHtml(null),
    e => e.category === 'broken-markup',
  );
});

test('parseHtml: quoted attribute containing > does not end the tag', () => {
  const root = parseHtml('<a title="a>b" href="/x">t</a>');
  assert.strictEqual(first(root, 'a').attrs.title, 'a>b');
});

test('hasClass, byClass and all: class lookup is token based', () => {
  const root = parseHtml('<div class="card big"><span class="card-title">x</span><i class="card">y</i></div>');
  assert.strictEqual(hasClass(first(root, 'div'), 'card'), true);
  assert.strictEqual(hasClass(first(root, 'span'), 'card'), false);
  assert.strictEqual(hasClass(undefined, 'card'), false);
  assert.deepStrictEqual(
    byClass(root, 'card').map(n => n.tag),
    ['div', 'i'],
  );
  assert.deepStrictEqual(
    all(undefined, () => true),
    [],
  );
  assert.deepStrictEqual(
    all(root, n => n.tag === 'nothing'),
    [],
  );
});

test('nodeText: joins children with spaces, collapses whitespace, tolerates missing nodes', () => {
  const root = parseHtml('<div> a <b>b</b><i>c</i> </div>');
  assert.strictEqual(nodeText(first(root, 'div')), 'a b c');
  assert.strictEqual(nodeText(undefined), '');
  assert.strictEqual(nodeText('plain'), 'plain');
});

test('nodeText: skip predicate removes whole subtrees', () => {
  const root = parseHtml('<div>keep<span class="salary">100</span><b>more</b></div>');
  assert.strictEqual(
    nodeText(first(root, 'div'), n => hasClass(n, 'salary')),
    'keep more',
  );
  assert.strictEqual(
    nodeText(first(root, 'span'), n => hasClass(n, 'salary')),
    '',
  );
});

test('checkAccess: challenge titles, challenge ids and login prose are access errors', () => {
  for (const html of [
    '<title>Just a moment...</title><p>x</p>',
    '<title>Доступ ограничен</title>',
    '<div id="smartcaptcha-box"></div>',
    '<p>Verify you are human</p>',
    '<p>Войдите, чтобы продолжить</p>',
  ])
    assert.throws(
      () => checkAccess(parseHtml(html)),
      e => e.category === 'access',
      html,
    );
});

test('checkAccess: ordinary pages pass', () => {
  assert.doesNotThrow(() => checkAccess(parseHtml('<title>Vacancies</title><div class="vacancy-card">x</div>')));
});

test('checkAccess: password input is a login wall unless a listing is present', () => {
  assert.throws(
    () => checkAccess(parseHtml('<form><input type="password"></form>')),
    e => e.category === 'access' && e.message === 'Login wall',
  );
  assert.doesNotThrow(() => checkAccess(parseHtml('<input type="password"><div class="vacancy-card"></div>')));
  assert.doesNotThrow(() => checkAccess(parseHtml('<input type="password"><ul class="serp-list"></ul>')));
  assert.doesNotThrow(() => checkAccess(parseHtml('<input type="text">')));
});

test('hasNext: habr style page parameter', () => {
  const url = 'https://career.habr.com/vacancies?page=1';
  assert.strictEqual(hasNext(parseHtml('<a href="/vacancies?page=2">2</a>'), url), true);
  assert.strictEqual(hasNext(parseHtml('<a href="/vacancies?page=1">1</a>'), url), false);
  assert.strictEqual(hasNext(parseHtml('<a href="?page=3">3</a>'), 'https://career.habr.com/vacancies?page=2'), true);
  const link = parseHtml('<a href="/vacancies?page=2">2</a>');
  assert.strictEqual(hasNext(link, 'https://career.habr.com/vacancies'), true);
});

test('hasNext: links to another origin or another path do not count', () => {
  const url = 'https://career.habr.com/vacancies';
  assert.strictEqual(hasNext(parseHtml('<a href="https://evil.example/vacancies?page=2">2</a>'), url), false);
  assert.strictEqual(hasNext(parseHtml('<a href="/other?page=2">2</a>'), url), false);
  assert.strictEqual(hasNext(parseHtml('<a>2</a>'), url), false);
  assert.strictEqual(hasNext(parseHtml('<p>none</p>'), url), false);
});

test('hasNext: geekjob style numeric path segment', () => {
  const html = parseHtml('<a href="/vacancies/2">2</a>');
  assert.strictEqual(hasNext(html, 'https://geekjob.ru/vacancies/'), true);
  assert.strictEqual(hasNext(html, 'https://geekjob.ru/vacancies/2'), false);
  assert.strictEqual(hasNext(parseHtml('<a href="/vacancies/3">3</a>'), 'https://geekjob.ru/vacancies/2'), true);
  assert.strictEqual(hasNext(parseHtml('<a href="/vacancies?page=5">5</a>'), 'https://geekjob.ru/vacancies/'), false);
  assert.strictEqual(hasNext(parseHtml('<a href="/vacancy/abc">x</a>'), 'https://geekjob.ru/vacancies/'), false);
});

test('legacy: parseHtml falls back to map/lastIndexOf when findLastIndex is unavailable', () => {
  const original = Array.prototype.findLastIndex;
  Array.prototype.findLastIndex = undefined;
  try {
    const root = parseHtml('<div><p>a</p></div>b');
    assert.strictEqual(root.children[1], 'b');
    assert.strictEqual(all(root, n => n.tag === 'p').length, 1);
  } finally {
    Array.prototype.findLastIndex = original;
  }
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
console.log(`${tests.length - failures}/${tests.length} html tests passed`);
process.exitCode = failures ? 1 : 0;
