// Retry policy for listing requests: back off on transient failures only.
import { categoryOf } from '../errors.mjs';

const MAX_RETRY_AFTER_MS = 10_000;
const MAX_BACKOFF_MS = 5000;
const BASE_BACKOFF_MS = 500;
const JITTER_MS = 250;
const RETRYABLE_CATEGORIES = ['network', 'server', 'rate-limited'];

// LEGACY(parser-pipeline): `sleep` is redefined in queue.mjs too; left duplicated.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * How long the server asked us to wait, from a Retry-After header or property.
 * @param {any} error Failure that may carry `retryAfter` or `headers`.
 * @param {number} [now] Current time in ms, for HTTP-date values.
 * @returns {number} Milliseconds, capped at 10 seconds; 0 when absent or invalid.
 */
export function retryAfterMs(error, now = Date.now()) {
  const headers = error?.headers ?? error?.response?.headers;
  const raw =
    error?.retryAfter ??
    headers?.get?.('retry-after') ??
    headers?.['retry-after'];
  if (raw == null || raw === '') return 0;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - now;
  return Number.isFinite(ms)
    ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms))
    : 0;
}

/**
 * Run `run`, retrying network, server and rate-limit failures.
 * @template T
 * @param {() => Promise<T>} run
 * @param {object} [options]
 * @param {number} [options.retries] Extra attempts after the first.
 * @param {(ms: number) => Promise<void>} [options.wait] Injected for tests.
 * @param {() => number} [options.random] Injected for tests.
 * @returns {Promise<T>}
 */
export async function withRetry(
  run,
  { retries = 2, wait = sleep, random = Math.random } = {},
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const retryable = RETRYABLE_CATEGORIES.includes(categoryOf(error));
      if (attempt >= retries || !retryable) throw error;
      const jitter = Math.floor(random() * JITTER_MS);
      const backoff = Math.min(
        MAX_BACKOFF_MS,
        BASE_BACKOFF_MS * 2 ** attempt + jitter,
      );
      await wait(Math.max(backoff, retryAfterMs(error)));
    }
  }
}
