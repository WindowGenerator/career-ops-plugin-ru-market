import { strict as assert } from 'node:assert';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'reports']);
const DOC_CATEGORIES = ['providers', 'architecture', 'research', 'roadmap'];
const CYRILLIC = /[Ѐ-ӿ]/;

// Replace fenced code blocks and inline code spans with blanks, keeping line structure.
export function stripCode(text, inline = true) {
  const out = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && /^\s*(`+|~+)\s*$/.test(line)) fence = null;
      out.push('');
    } else if (open) { fence = open[1]; out.push(''); } else out.push(inline ? line.replace(/(`+)[^`]*?\1/g, ' ') : line);
  }
  return out.join('\n');
}

// Relative link and image targets outside code. Reference definitions are included.
export function extractLinks(text) {
  const body = stripCode(text);
  const links = [];
  for (const m of body.matchAll(/!?\[(?:[^\]\n]|\[[^\]\n]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) links.push(m[1]);
  for (const m of body.matchAll(/^\s{0,3}\[[^\]\n]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/gm)) links.push(m[1]);
  return links.filter(t => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(t));
}

// GitHub-style heading slugs for the headings outside code.
export function headingSlugs(text) {
  const seen = new Map();
  const slugs = new Set();
  for (const line of stripCode(text, false).split('\n')) {
    const m = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const plain = m[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_~]/g, '');
    const base = plain.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    slugs.add(n ? `${base}-${n}` : base);
  }
  return slugs;
}

// Cyrillic outside inline code, fenced blocks and blockquote lines.
export function findCyrillic(text) {
  const hits = [];
  let fence = null;
  text.split('\n').forEach((line, index) => {
    const open = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && /^\s*(`+|~+)\s*$/.test(line)) fence = null;
      return;
    }
    if (open) { fence = open[1]; return; }
    if (/^\s{0,3}>/.test(line)) return;
    if (CYRILLIC.test(line.replace(/(`+)[^`]*?\1/g, ' '))) hits.push({ line: index + 1, text: line.trim().slice(0, 80) });
  });
  return hits;
}

const inCyrillicScope = rel => rel.startsWith('docs/') || !rel.includes('/') || rel === 'companion/README.md'
  || /^examples\/[^/]+\.md$/.test(rel);

// A docs file is allowed only as docs/README.md or docs/<category>/**.
export function layoutProblem(rel) {
  if (!rel.startsWith('docs/') || rel === 'docs/README.md') return undefined;
  const [, category, ...rest] = rel.split('/');
  return rest.length && DOC_CATEGORIES.includes(category) ? undefined
    : `${rel} is outside docs/README.md and docs/{${DOC_CATEGORIES.join(',')}}/`;
}

export const missingHeader = text => ['Status', 'Date'].filter(key => !new RegExp(`^${key}:\\s*\\S`, 'm').test(text.split('\n').slice(0, 8).join('\n')));

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.md')) out.push(full);
  }
  return out;
}

function checkLink(file, target, slugCache) {
  const [raw, fragment] = target.split('#');
  let path;
  try { path = decodeURIComponent(raw.split('?')[0]); } catch { return `${target}: malformed escape`; }
  if (!path) return undefined;
  const resolved = path.startsWith('/') ? join(root, path) : resolve(dirname(file), path);
  if (resolved !== root && !resolved.startsWith(root + sep)) return `${target}: points outside the repository`;
  if (!existsSync(resolved)) return `${target}: file not found`;
  if (fragment && resolved.endsWith('.md') && statSync(resolved).isFile()) {
    if (!slugCache.has(resolved)) slugCache.set(resolved, headingSlugs(readFileSync(resolved, 'utf8')));
    if (!slugCache.get(resolved).has(decodeURIComponent(fragment).toLowerCase())) return `${target}: heading anchor not found`;
  }
  return undefined;
}

export function checkRepository(base = root) {
  const errors = [];
  const warnings = [];
  const slugCache = new Map();
  for (const file of walk(base)) {
    const rel = relative(base, file).split(sep).join('/');
    const text = readFileSync(file, 'utf8');
    for (const target of extractLinks(text)) {
      const problem = checkLink(file, target, slugCache);
      if (problem) errors.push(`${rel}: broken link ${problem}`);
    }
    if (inCyrillicScope(rel)) for (const hit of findCyrillic(text)) errors.push(`${rel}:${hit.line}: Cyrillic outside code/quote: ${hit.text}`);
    const layout = layoutProblem(rel);
    if (layout) errors.push(layout);
    if (rel.startsWith('docs/') && !['docs/README.md', 'docs/providers/README.md'].includes(rel)) {
      const missing = missingHeader(text);
      if (missing.length) warnings.push(`${rel}: missing header ${missing.map(k => `${k}:`).join(', ')}`);
    }
  }
  return { errors, warnings };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('links: relative targets are extracted, code and external targets are ignored', () => {
  const text = [
    '[a](docs/a.md) ![img](../pic.png "title") [ext](https://x.y/z) [mail](mailto:a@b.c) [top](#top) [pr](//cdn/x)',
    '`[code](nope.md)`', '```', '[fenced](nope2.md)', '```', '[ref]: other.md#part', '[nest [x]](deep.md#h)',
  ].join('\n');
  assert.deepEqual(extractLinks(text), ['docs/a.md', '../pic.png', 'deep.md#h', 'other.md#part']);
});

test('links: broken file and heading anchors are reported, valid ones pass', () => {
  assert.deepEqual([...headingSlugs('# Title\n## Filter matrix\n## Filter matrix\n```\n# not a heading\n```\n## `code` and (parens)!')],
    ['title', 'filter-matrix', 'filter-matrix-1', 'code-and-parens']);
  const cache = new Map();
  assert.equal(checkLink(join(root, 'README.md'), 'docs/README.md', cache), undefined);
  assert.equal(checkLink(join(root, 'README.md'), 'docs/README.md#rules', cache), undefined);
  assert.match(checkLink(join(root, 'README.md'), 'docs/missing.md', cache), /file not found/);
  assert.match(checkLink(join(root, 'README.md'), 'docs/README.md#no-such-heading', cache), /anchor not found/);
  assert.match(checkLink(join(root, 'docs/README.md'), '../../outside.md', cache), /outside the repository/);
});

test('cyrillic: allowed only in inline code, fenced blocks and blockquote lines', () => {
  const text = ['Plain English text.', 'Query `Москва` is fine.', '> «Зарплата» quote', '```yaml', 'l: [Москва]', '```',
    'Bad prose Привет here.', '   > indented quote Да', 'После fence', '````', '```', 'Внутри', '````', 'Again plain'].join('\n');
  assert.deepEqual(findCyrillic(text).map(h => h.line), [7, 9]);
});

test('layout: only docs/README.md and the four categories are allowed under docs/', () => {
  for (const ok of ['docs/README.md', 'docs/providers/hh.md', 'docs/roadmap/x.md', 'docs/research/x.md', 'docs/architecture/x.md', 'README.md', 'companion/README.md']) {
    assert.equal(layoutProblem(ok), undefined, ok);
  }
  for (const bad of ['docs/hh.md', 'docs/archive/old.md', 'docs/user/guide.md', 'docs/providers.md']) assert.match(layoutProblem(bad), /outside/, bad);
});

test('header: Status and Date are required near the top, missing ones are warned about', () => {
  assert.deepEqual(missingHeader('# T\n\nStatus: Reference\nDate: 2026-10-10\nType: research\n'), []);
  assert.deepEqual(missingHeader('# T\n\nStatus: Planned\n'), ['Date']);
  assert.deepEqual(missingHeader('# T\n\nText\n'), ['Status', 'Date']);
});

test('scope: Cyrillic is checked in docs, root, companion README and examples markdown only', () => {
  assert(inCyrillicScope('docs/research/x.md') && inCyrillicScope('README.md') && inCyrillicScope('companion/README.md') && inCyrillicScope('examples/registry-pr.md'));
  assert(!inCyrillicScope('fixtures/x/README.md') && !inCyrillicScope('test/notes.md'));
});

test('repository documentation follows the rules', () => {
  const { errors, warnings } = checkRepository();
  for (const warning of warnings) console.warn(`WARN - docs: ${warning}`);
  assert.deepEqual(errors, []);
});

let failures = 0;
for (const { name, run } of tests) {
  try { await run(); console.log(`ok - docs: ${name}`); } catch (error) { failures++; console.error(`FAIL - docs: ${name}`, error); }
}
if (failures) process.exitCode = 1;
