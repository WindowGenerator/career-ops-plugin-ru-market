import { enqueue } from './queue.mjs';
import { withRetry } from './retry.mjs';
import { SourceError } from './errors.mjs';

export const USER_AGENT = 'career-ops-ru-market/0.7.0 (+https://github.com/WindowGenerator/career-ops-plugin-ru-market)';

export function assertRequestUrl(value) {
  const url = new URL(value);
  const allowed = url.hostname === 'career.habr.com' ? /^\/vacancies(?:\/[a-z0-9_]+)?(?:\/remote)?\/?$/.test(url.pathname)
    : url.hostname === 'geekjob.ru' ? /^\/vacancies\/(?:\d+)?$/.test(url.pathname)
    : url.hostname === 'api.superjob.ru' ? url.pathname === '/2.0/vacancies/'
    : url.hostname === 'www.helloworld.rs' ? /^\/oglasi-za-posao(?:\/stranica\/(?:0|[1-9]\d*))?\/?$/.test(url.pathname)
    : url.hostname === 'getmatch.ru' ? url.pathname === '/api/offers'
    : url.hostname === 'opendata.trudvsem.ru' && url.pathname === '/api/v1/vacancies';
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new SourceError('access', 'Request outside public listing endpoints');
  }
  return url;
}

export async function request(ctx, value, kind, { retries = 2 } = {}) {
  const url = assertRequestUrl(value);
  const headers = { 'User-Agent': USER_AGENT, Accept: kind === 'json' ? 'application/json' : 'text/html' };
  if (url.hostname === 'api.superjob.ru') {
    const key = ctx.env?.SUPERJOB_API_KEY;
    if (typeof key !== 'string' || !/^[\x21-\x7e]+$/.test(key)) throw new SourceError('config', 'SUPERJOB_API_KEY is required for SuperJob');
    headers['X-Api-App-Id'] = key;
  }
  return withRetry(() => enqueue(url.hostname, () => ctx[kind === 'json' ? 'fetchJson' : 'fetchText'](
    url.href, { headers, timeoutMs: 10_000 },
  )), { retries });
}
