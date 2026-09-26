import { clean, decode } from './normalize.mjs';
import { SourceError } from './errors.mjs';

const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
// Small read-only HTML tree for known listing markup, not a browser DOM.
// Script/style payloads are deliberately excluded (no embedded API execution).
export function parseHtml(html) {
  if (typeof html !== 'string') throw new SourceError('broken-markup', 'Expected HTML text');
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const safe = html.replace(/<!--[^]*?-->/g, '').replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '');
  for (const match of safe.matchAll(/<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/gi)) {
    const token = match[0];
    if (token[0] !== '<') { stack.at(-1).children.push(decode(token)); continue; }
    const tag = /^<\/?([a-z0-9-]+)/i.exec(token)?.[1].toLowerCase();
    if (token.startsWith('</')) {
      const index = stack.findLastIndex ? stack.findLastIndex(n => n.tag === tag) : stack.map(n => n.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    const attrs = {};
    const rest = token.slice(tag.length + 1, -1);
    for (const a of rest.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(tag) && !/\/\s*>$/.test(token)) stack.push(node);
  }
  return root;
}
export const hasClass = (node, value) => (node?.attrs?.class ?? '').split(/\s+/).includes(value);
export function all(node, predicate) {
  const result = [];
  const visit = n => {
    if (typeof n === 'string') return;
    if (predicate(n)) result.push(n);
    for (const child of n.children) visit(child);
  };
  if (node) visit(node);
  return result;
}
export const byClass = (node, value) => all(node, n => hasClass(n, value));
export function nodeText(node, skip = () => false) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (skip(node)) return '';
  return clean(node.children.map(child => nodeText(child, skip)).join(' '));
}
export function checkAccess(root) {
  const title = nodeText(all(root, n => n.tag === 'title')[0]);
  const text = nodeText(root);
  if (/captcha|access denied|just a moment|checking your browser|доступ ограничен|проверка браузера/i.test(title)
    || all(root, n => /^(?:captcha|challenge-form|cf-challenge|smartcaptcha)/i.test(n.attrs.id ?? '')).length
    || /подтвердите, что вы не робот|verify you are human|войдите, чтобы (?:просмотреть|продолжить)/i.test(text)) {
    throw new SourceError('access', 'Challenge or login wall');
  }
  if (all(root, n => n.tag === 'input' && n.attrs.type === 'password').length
    && !byClass(root, 'vacancy-card').length && !byClass(root, 'serp-list').length) {
    throw new SourceError('access', 'Login wall');
  }
}
export function hasNext(root, currentUrl) {
  const current = new URL(currentUrl);
  const geek = current.hostname === 'geekjob.ru';
  const page = geek ? Number(current.pathname.match(/\/vacancies\/(\d+)/)?.[1] ?? 1) : Number(current.searchParams.get('page') ?? 1);
  return all(root, n => n.tag === 'a' && n.attrs.href).some(n => {
    try {
      const target = new URL(n.attrs.href, current);
      return target.origin === current.origin && (geek
        ? /^\/vacancies\/\d+$/.test(target.pathname) && Number(target.pathname.split('/').at(-1)) > page
        : target.pathname === current.pathname && Number(target.searchParams.get('page')) > page);
    } catch { return false; }
  });
}
