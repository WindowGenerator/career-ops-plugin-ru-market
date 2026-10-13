// The only door to the network: allowlisted public listing endpoints.
//
// Providers never call ctx.fetchText / ctx.fetchJson directly. request() checks
// the URL against the allowlist, adds the plugin headers, queues the call per
// host and retries transient failures.
import { enqueue } from './queue.mjs';
import { withRetry } from './retry.mjs';
import { SourceError } from '../errors.mjs';

// The release procedure (RELEASING.md) bumps the version in this string.
const PROJECT_URL =
  'https://github.com/WindowGenerator/career-ops-plugin-ru-market';
export const USER_AGENT = `career-ops-ru-market/0.8.0 (+${PROJECT_URL})`;

const REQUEST_TIMEOUT_MS = 10_000;
const API_KEY_FORMAT = /^[\x21-\x7e]+$/;

const HABR_PATH = /^\/vacancies(?:\/[a-z0-9_]+)?(?:\/remote)?\/?$/;
const GEEKJOB_PATH = /^\/vacancies\/(?:\d+)?$/;
const HELLOWORLD_PATH = /^\/oglasi-za-posao(?:\/stranica\/(?:0|[1-9]\d*))?\/?$/;

/**
 * Allowed listing paths per host. Keys must equal `LISTING_HOSTS`; a test checks it.
 */
export const ALLOWED_PATHS = {
  'career.habr.com': path => HABR_PATH.test(path),
  'geekjob.ru': path => GEEKJOB_PATH.test(path),
  'api.superjob.ru': path => path === '/2.0/vacancies/',
  'www.helloworld.rs': path => HELLOWORLD_PATH.test(path),
  'getmatch.ru': path => path === '/api/offers',
  'opendata.trudvsem.ru': path => path === '/api/v1/vacancies',
};

/**
 * Accept only public HTTPS listing endpoints without credentials or ports.
 * @param {string} value Absolute URL.
 * @returns {URL} The parsed URL.
 * @throws {SourceError} `access` for anything else.
 * @throws {TypeError} When `value` is not a URL at all.
 */
export function assertRequestUrl(value) {
  const url = new URL(value);
  const hostKnown = Object.hasOwn(ALLOWED_PATHS, url.hostname);
  const pathAllowed = hostKnown && ALLOWED_PATHS[url.hostname](url.pathname);
  const plain =
    url.protocol === 'https:' && !url.username && !url.password && !url.port;
  if (!pathAllowed || !plain) {
    throw new SourceError('access', 'Request outside public listing endpoints');
  }
  return url;
}

/**
 * @param {URL} url
 * @param {'json' | 'text'} kind
 * @param {Record<string, any> | undefined} env Plugin environment variables.
 * @returns {Record<string, string>} Request headers.
 */
function requestHeaders(url, kind, env) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: kind === 'json' ? 'application/json' : 'text/html',
  };
  if (url.hostname === 'api.superjob.ru') {
    const key = env?.SUPERJOB_API_KEY;
    if (typeof key !== 'string' || !API_KEY_FORMAT.test(key)) {
      throw new SourceError(
        'config',
        'SUPERJOB_API_KEY is required for SuperJob',
      );
    }
    headers['X-Api-App-Id'] = key;
  }
  return headers;
}

/**
 * Fetch one listing page through the guarded context.
 * @param {any} ctx Plugin context with `fetchText`, `fetchJson` and `env`.
 * @param {string} value Request URL.
 * @param {'json' | 'text'} kind Body type.
 * @param {object} [options]
 * @param {number} [options.retries] Retries after the first attempt.
 * @returns {Promise<any>} Parsed JSON or response text.
 * @throws {SourceError} `access` for forbidden URLs, `config` for a missing API key.
 */
export async function request(ctx, value, kind, { retries = 2 } = {}) {
  const url = assertRequestUrl(value);
  const headers = requestHeaders(url, kind, ctx.env);
  const fetchBody = ctx[kind === 'json' ? 'fetchJson' : 'fetchText'];
  const init = { headers, timeoutMs: REQUEST_TIMEOUT_MS };
  const call = () =>
    enqueue(url.hostname, () => fetchBody.call(ctx, url.href, init));
  return withRetry(call, { retries });
}
