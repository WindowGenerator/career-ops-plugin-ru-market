// Minimal read-only HTML tree for known listing markup.
//
// Providers need to find cards by class and read their text, nothing more. This
// is a small tolerant tokenizer, not a browser DOM: script and style payloads
// are dropped on purpose so embedded code or data is never interpreted.
import { clean, decode } from '../processors/normalize.mjs';
import { SourceError } from '../errors.mjs';

/**
 * @typedef {object} HtmlNode
 * @property {string} tag Lower-case tag name, or `#root` for the document.
 * @property {Record<string, string>} attrs Lower-case attribute names, decoded values.
 * @property {Array<HtmlNode | string>} children Elements and decoded text, in order.
 */

const VOID_TAGS = new Set(
  'area base br col embed hr img input link meta param source track wbr'.split(
    ' ',
  ),
);
const COMMENT = /<!--[^]*?-->/g;
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi;
const TOKEN = /<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/gi;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const CHALLENGE_TITLE =
  /captcha|access denied|just a moment|checking your browser|доступ ограничен|проверка браузера/i;
const CHALLENGE_ID = /^(?:captcha|challenge-form|cf-challenge|smartcaptcha)/i;
const CHALLENGE_TEXT =
  /подтвердите, что вы не робот|verify you are human|войдите, чтобы (?:просмотреть|продолжить)/i;

/**
 * @param {HtmlNode[]} stack Open elements, innermost last.
 * @param {string} tag
 * @returns {number} Index of the innermost open element with this tag, or -1.
 */
function lastOpenIndex(stack, tag) {
  // LEGACY(parser-pipeline): defensive fallback for runtimes without findLastIndex. It is dead code on
  // the declared Node >=18 and is kept (and pinned by a test) rather than removed in a refactor.
  if (stack.findLastIndex) return stack.findLastIndex(node => node.tag === tag);
  return stack.map(node => node.tag).lastIndexOf(tag);
}

/**
 * @param {string} token A start tag such as `<a href="x">`.
 * @param {string} tag
 * @returns {Record<string, string>}
 */
function parseAttributes(token, tag) {
  const attrs = {};
  const rest = token.slice(tag.length + 1, -1);
  for (const match of rest.matchAll(ATTRIBUTE)) {
    attrs[match[1].toLowerCase()] = decode(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return attrs;
}

/**
 * Parse listing HTML into a tolerant tree.
 * @param {string} html
 * @returns {HtmlNode} Synthetic `#root` node.
 * @throws {SourceError} `broken-markup` when the input is not text.
 */
export function parseHtml(html) {
  if (typeof html !== 'string')
    throw new SourceError('broken-markup', 'Expected HTML text');
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const safe = html.replace(COMMENT, '').replace(SCRIPT_OR_STYLE, '');
  for (const match of safe.matchAll(TOKEN)) {
    const token = match[0];
    if (token[0] !== '<') {
      stack.at(-1).children.push(decode(token));
      continue;
    }
    const tag = /^<\/?([a-z0-9-]+)/i.exec(token)?.[1].toLowerCase();
    if (token.startsWith('</')) {
      const index = lastOpenIndex(stack, tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const node = { tag, attrs: parseAttributes(token, tag), children: [] };
    stack.at(-1).children.push(node);
    const selfClosing = /\/\s*>$/.test(token);
    if (!VOID_TAGS.has(tag) && !selfClosing) stack.push(node);
  }
  return root;
}

/**
 * @param {HtmlNode | undefined} node
 * @param {string} value One class token.
 * @returns {boolean}
 */
export function hasClass(node, value) {
  return (node?.attrs?.class ?? '').split(/\s+/).includes(value);
}

/**
 * Collect matching elements in document order, including `node` itself.
 * @param {HtmlNode | undefined} node
 * @param {(node: HtmlNode) => boolean} predicate
 * @returns {HtmlNode[]}
 */
export function all(node, predicate) {
  const result = [];
  const visit = current => {
    if (typeof current === 'string') return;
    if (predicate(current)) result.push(current);
    for (const child of current.children) visit(child);
  };
  if (node) visit(node);
  return result;
}

/**
 * @param {HtmlNode | undefined} node
 * @param {string} value One class token.
 * @returns {HtmlNode[]}
 */
export function byClass(node, value) {
  return all(node, n => hasClass(n, value));
}

/**
 * Visible text of a node, whitespace-collapsed.
 * @param {HtmlNode | string | undefined} node
 * @param {(node: HtmlNode) => boolean} [skip] Subtrees to leave out.
 * @returns {string}
 */
export function nodeText(node, skip = () => false) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (skip(node)) return '';
  return clean(node.children.map(child => nodeText(child, skip)).join(' '));
}

/**
 * Refuse challenge pages and login walls before any card is read.
 * @param {HtmlNode} root
 * @throws {SourceError} `access` when the page is not a public listing.
 */
export function checkAccess(root) {
  const title = nodeText(all(root, n => n.tag === 'title')[0]);
  const text = nodeText(root);
  const challengeId =
    all(root, n => CHALLENGE_ID.test(n.attrs.id ?? '')).length > 0;
  if (CHALLENGE_TITLE.test(title) || challengeId || CHALLENGE_TEXT.test(text)) {
    throw new SourceError('access', 'Challenge or login wall');
  }
  const hasPasswordInput =
    all(root, n => n.tag === 'input' && n.attrs.type === 'password').length > 0;
  const hasListing =
    byClass(root, 'vacancy-card').length > 0 ||
    byClass(root, 'serp-list').length > 0;
  if (hasPasswordInput && !hasListing)
    throw new SourceError('access', 'Login wall');
}

/**
 * Habr pages paginate with `?page=N`; GeekJob with `/vacancies/N`.
 * @param {URL} current
 * @returns {{ geek: boolean, page: number }}
 */
function currentPage(current) {
  const geek = current.hostname === 'geekjob.ru';
  const pathPage = current.pathname.match(/\/vacancies\/(\d+)/)?.[1] ?? 1;
  return {
    geek,
    page: Number(geek ? pathPage : (current.searchParams.get('page') ?? 1)),
  };
}

/**
 * @param {URL} target A link on the same origin as `current`.
 * @param {URL} current
 * @param {boolean} geek
 * @param {number} page
 * @returns {boolean} True when the link points to a later page of the same listing.
 */
function isLaterPage(target, current, geek, page) {
  if (geek) {
    return (
      /^\/vacancies\/\d+$/.test(target.pathname) &&
      Number(target.pathname.split('/').at(-1)) > page
    );
  }
  return (
    target.pathname === current.pathname &&
    Number(target.searchParams.get('page')) > page
  );
}

/**
 * Whether the page links to a later page of the same listing.
 * @param {HtmlNode} root
 * @param {string} currentUrl
 * @returns {boolean}
 */
export function hasNext(root, currentUrl) {
  const current = new URL(currentUrl);
  const { geek, page } = currentPage(current);
  return all(root, n => n.tag === 'a' && n.attrs.href).some(link => {
    try {
      const target = new URL(link.attrs.href, current);
      return (
        target.origin === current.origin &&
        isLaterPage(target, current, geek, page)
      );
    } catch {
      return false;
    }
  });
}
