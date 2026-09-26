import { categoryOf } from './errors.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function retryAfterMs(error, now = Date.now()) {
  const headers = error?.headers ?? error?.response?.headers;
  const raw = error?.retryAfter ?? headers?.get?.('retry-after') ?? headers?.['retry-after'];
  if (raw == null || raw === '') return 0;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(raw) - now;
  return Number.isFinite(ms) ? Math.min(10_000, Math.max(0, ms)) : 0;
}

export async function withRetry(run, { retries = 2, wait = sleep, random = Math.random } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); }
    catch (error) {
      if (attempt >= retries || !['network', 'server', 'rate-limited'].includes(categoryOf(error))) throw error;
      const backoff = Math.min(5000, 500 * 2 ** attempt + Math.floor(random() * 250));
      await wait(Math.max(backoff, retryAfterMs(error)));
    }
  }
}
