export class SourceError extends Error {
  constructor(category, message, options) {
    super(message, options);
    this.name = 'SourceError';
    this.category = category;
  }
}

export function categoryOf(error) {
  if (error?.category) return error.category;
  const status = Number(error?.status ?? error?.response?.status
    ?? /\bHTTP\s+(\d{3})\b/i.exec(error?.message ?? '')?.[1]);
  if (status === 429) return 'rate-limited';
  if (status === 401 || status === 403) return 'access';
  if (status >= 500 && status <= 599) return 'server';
  if (status >= 400) return 'http';
  if (error instanceof SyntaxError) return 'broken-markup';
  if (/captcha|challenge|interstitial|login wall/i.test(error?.message ?? '')) return 'access';
  if (/egress|allowedHosts|blocked|redirect/i.test(error?.message ?? '')) return 'access';
  if (['AbortError', 'TimeoutError'].includes(error?.name)
    || /fetch failed|network|timeout|timed out|cannot resolve|ENOTFOUND|ECONN|EAI_AGAIN/i.test(error?.message ?? '')
    || /^(EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(error?.code ?? '')) return 'network';
  return 'unknown';
}
