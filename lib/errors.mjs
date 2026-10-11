// Error vocabulary shared by every provider.
//
// A failed source is reported by category (access, network, ...), never by
// raw message, so callers can decide to retry, stop or just log it. SourceError
// carries the category explicitly; categoryOf() infers one for foreign errors.

/** Error with an explicit category such as `access`, `config` or `broken-markup`. */
export class SourceError extends Error {
  /**
   * @param {string} category Failure class used for retry and logging decisions.
   * @param {string} message Human-readable text; must not contain source data.
   * @param {ErrorOptions} [options] Standard error options, for example `cause`.
   */
  constructor(category, message, options) {
    super(message, options);
    this.name = 'SourceError';
    this.category = category;
  }
}

const HTTP_STATUS_IN_MESSAGE = /\bHTTP\s+(\d{3})\b/i;
const ACCESS_MESSAGE = /captcha|challenge|interstitial|login wall/i;
const EGRESS_MESSAGE = /egress|allowedHosts|blocked|redirect/i;
const NETWORK_MESSAGE = /fetch failed|network|timeout|timed out|cannot resolve|ENOTFOUND|ECONN|EAI_AGAIN/i;
const NETWORK_NAMES = ['AbortError', 'TimeoutError'];
const NETWORK_CODE = /^(EAI_AGAIN|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/;

/**
 * Read an HTTP status from `status`, `response.status` or an "HTTP 503" message.
 * @param {any} error
 * @returns {number} NaN when none is present.
 */
function statusOf(error) {
  const fromMessage = HTTP_STATUS_IN_MESSAGE.exec(error?.message ?? '')?.[1];
  return Number(error?.status ?? error?.response?.status ?? fromMessage);
}

/**
 * Classify an HTTP status into a failure category.
 * @param {number} status
 * @returns {string | undefined} Undefined for statuses below 400 or NaN.
 */
function categoryOfStatus(status) {
  if (status === 429) return 'rate-limited';
  if (status === 401 || status === 403) return 'access';
  if (status >= 500 && status <= 599) return 'server';
  if (status >= 400) return 'http';
  return undefined;
}

/**
 * @param {any} error
 * @returns {boolean} True for timeouts, aborted requests and DNS/socket failures.
 */
function isNetworkError(error) {
  return (
    NETWORK_NAMES.includes(error?.name) ||
    NETWORK_MESSAGE.test(error?.message ?? '') ||
    NETWORK_CODE.test(error?.code ?? '')
  );
}

/**
 * Map any thrown value to a failure category.
 * @param {any} error Anything caught from a request or a parser.
 * @returns {string} One of: the error's own category, `rate-limited`, `access`,
 *   `server`, `http`, `broken-markup`, `network` or `unknown`.
 */
export function categoryOf(error) {
  if (error?.category) return error.category;
  const byStatus = categoryOfStatus(statusOf(error));
  if (byStatus) return byStatus;
  if (error instanceof SyntaxError) return 'broken-markup';
  const message = error?.message ?? '';
  if (ACCESS_MESSAGE.test(message) || EGRESS_MESSAGE.test(message)) return 'access';
  if (isNetworkError(error)) return 'network';
  return 'unknown';
}
