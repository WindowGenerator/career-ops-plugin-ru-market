// Compensation: explicit source units only.
//
// A salary is kept exactly as the source states it: amounts, currency, period
// and tax basis, each one `unknown` when the source does not say. No currency,
// tax or annualisation conversion is ever guessed.

const PERIODS = ['month', 'year', 'hour', 'shift'];
const TAX_BASES = ['gross', 'net'];
const DEFAULT_FILTER_PERIOD = 'year';

/**
 * @param {unknown} value
 * @returns {string} Whitespace-collapsed text; empty for non-strings.
 */
const tidy = value => (typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '');

/**
 * @typedef {object} Compensation
 * @property {'month' | 'year' | 'hour' | 'shift' | 'unknown'} period
 * @property {'gross' | 'net' | 'unknown'} taxBasis
 * @property {string} rawText Source wording.
 * @property {string} [currency] ISO 4217 code; RUR is reported as RUB.
 * @property {number} [min]
 * @property {number} [max]
 * @property {string} [diagnostic] Why amounts were not trusted.
 */

/**
 * @param {any} value
 * @param {string[]} supplied Names of the bounds present in `value`.
 * @returns {boolean} True when the bounds are finite, non-negative and ordered.
 */
function areAmountsValid(value, supplied) {
  if (!supplied.length) return false;
  const isAmount = key => typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0;
  const allFinite = supplied.every(isAmount);
  const ordered = !(value.min !== undefined && value.max !== undefined && value.min > value.max);
  return allFinite && ordered;
}

/**
 * Validate and canonicalise a compensation object.
 * @param {any} value
 * @returns {Compensation | undefined} Undefined for non-objects. Invalid amounts are
 *   dropped and flagged with `diagnostic: 'invalid-amount-or-currency'`.
 */
export function normalizeCompensation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {
    period: PERIODS.includes(value.period) ? value.period : 'unknown',
    taxBasis: TAX_BASES.includes(value.taxBasis) ? value.taxBasis : 'unknown',
    rawText: tidy(value.rawText),
  };
  if (typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency)) {
    out.currency = value.currency === 'RUR' ? 'RUB' : value.currency;
  }
  const supplied = ['min', 'max'].filter(key => value[key] !== undefined);
  if (areAmountsValid(value, supplied) && out.currency) {
    for (const key of supplied) out[key] = value[key];
  } else if (supplied.length) {
    out.diagnostic = 'invalid-amount-or-currency';
  }
  if (typeof value.diagnostic === 'string') out.diagnostic = value.diagnostic;
  return out;
}

/**
 * @param {string} raw
 * @returns {'month' | 'year' | 'hour' | 'shift' | 'unknown'}
 */
function periodOf(raw) {
  if (/(?:в|за) (?:месяц)|per month|\/month/i.test(raw)) return 'month';
  if (/(?:в|за) год|per year|annual|\/year/i.test(raw)) return 'year';
  if (/(?:в|за) час|per hour|\/hour/i.test(raw)) return 'hour';
  if (/(?:за|в) смену|per shift/i.test(raw)) return 'shift';
  return 'unknown';
}

/**
 * @param {string} raw
 * @returns {'gross' | 'net' | 'unknown'} Unknown when both or neither are mentioned.
 */
function taxBasisOf(raw) {
  const gross = /до вычета налогов|gross/i.test(raw);
  const net = /на руки|net/i.test(raw);
  if (gross && !net) return 'gross';
  if (net && !gross) return 'net';
  return 'unknown';
}

/**
 * LEGACY(parser-pipeline): the same currency regex chain is repeated in normalize.mjs
 * (parseSalary) with a slightly different RUB pattern; both copies are left as they are.
 * @param {string} raw
 * @returns {string | undefined}
 */
function detectedCurrency(raw) {
  if (/₽|руб|\bRU[BR]\b/i.test(raw)) return 'RUB';
  if (/\$|\bUSD\b/.test(raw)) return 'USD';
  if (/€|\bEUR\b/.test(raw)) return 'EUR';
  if (/₸|\bKZT\b/.test(raw)) return 'KZT';
  if (/\bBYN\b/.test(raw)) return 'BYN';
  return undefined;
}

// Only the leading amount expression determines a bound; tax prose cannot.
const AMOUNT = '(\\d+(?: \\d{3})*(?:[.,]\\d+)?)(?:\\s*(тыс\\.?|[kк]))?';
const CURRENCY_TOKEN = '(₽|руб\\.?|RUB|RUR|USD|EUR|KZT|BYN|UZS|GEL|AMD|\\$|€|₸)';
const LEADING_AMOUNT = new RegExp(
  `^(?:(от|до|from|up to)\\s+)?${AMOUNT}(?:\\s*[–—-]\\s*${AMOUNT})?\\s*${CURRENCY_TOKEN}(?=\\s|$|[,;])`,
  'i',
);
const ESTIMATE_WORDS = /не указ|договор|прогноз|похож|estimate|predicted/i;
const OTHER_PERIOD_WORDS = /недел|сутк|день|week|day/i;

/**
 * @param {string} digits Amount with space thousands and optional decimal comma.
 * @param {string | undefined} suffix "тыс." or "k" when present.
 * @returns {number}
 */
function amountOf(digits, suffix) {
  return Number(digits.replace(/ /g, '').replace(',', '.')) * (suffix ? 1000 : 1);
}

/**
 * @param {RegExpExecArray} match LEADING_AMOUNT groups.
 * @returns {{ min?: number, max?: number }}
 */
function boundsOf(match) {
  const first = amountOf(match[2], match[3]);
  if (match[4]) return { min: first, max: amountOf(match[4], match[5]) };
  if (/^(до|up to)$/i.test(match[1] ?? '')) return { max: first };
  if (/^(от|from)$/i.test(match[1] ?? '')) return { min: first };
  return { min: first, max: first };
}

/**
 * Parse a free-text salary such as "от 100 000 ₽ в месяц на руки".
 * @param {unknown} rawText
 * @param {string} [currencyHint] Currency known from structured data; RUR becomes RUB.
 * @returns {Compensation | undefined} Undefined for empty text. Ambiguous text is kept as
 *   `rawText` with a `diagnostic` and no amounts.
 */
export function parseCompensation(rawText, currencyHint) {
  const raw = tidy(rawText);
  if (!raw) return undefined;
  const period = periodOf(raw);
  const taxBasis = taxBasisOf(raw);
  const detected = detectedCurrency(raw);
  const currency = currencyHint === 'RUR' ? 'RUB' : currencyHint || detected;
  const result = { rawText: raw, period, taxBasis, ...(currency ? { currency } : {}) };
  const match = LEADING_AMOUNT.exec(raw);
  const ambiguous = !match || !currency || (detected && detected !== currency) || ESTIMATE_WORDS.test(raw);
  if (ambiguous) return normalizeCompensation({ ...result, diagnostic: 'ambiguous-amount-or-currency' });
  if (period === 'unknown' && OTHER_PERIOD_WORDS.test(raw)) {
    return normalizeCompensation({ ...result, diagnostic: 'unsupported-period' });
  }
  // LEGACY(parser-pipeline): a thousands suffix is applied only to the amount it follows, so
  // "100–200 тыс." parses as 100 and 200000. Pinned by a test; not fixed here.
  return normalizeCompensation({ ...result, ...boundsOf(match) });
}

/**
 * Compensation for a source that gives structured amounts plus display text.
 * @param {{ min?: number, max?: number, currency?: string } | undefined} salary
 * @param {string} [rawText] Display text, also searched for period and tax basis.
 * @param {string} [period] Period to use when the text does not name one.
 * @param {string} [taxBasis] Tax basis to use when the text does not name one.
 * @returns {Compensation | undefined}
 */
export function compensationFromSalary(salary, rawText = '', period = 'unknown', taxBasis = 'unknown') {
  const text = parseCompensation(rawText);
  // LEGACY(parser-pipeline): `text?.period !== 'unknown' ? text?.period ?? period : period` is kept
  // verbatim. The text period wins when it is known; an unparsable text falls back to `period`.
  const resolvedPeriod = text?.period !== 'unknown' ? (text?.period ?? period) : period;
  const resolvedTaxBasis = text?.taxBasis !== 'unknown' ? (text?.taxBasis ?? taxBasis) : taxBasis;
  return normalizeCompensation({
    rawText,
    period: resolvedPeriod,
    taxBasis: resolvedTaxBasis,
    currency: salary?.currency,
    ...(salary?.min !== undefined ? { min: salary.min } : {}),
    ...(salary?.max !== undefined ? { max: salary.max } : {}),
  });
}

/**
 * Whether a job's compensation overlaps a salary filter.
 * @param {unknown} value Compensation object of the job.
 * @param {{ min?: number, max?: number, currency?: string, period?: string, taxBasis?: string }} filter
 * @returns {boolean} True when the job should be kept.
 */
export function compensationMatchesFilter(value, filter) {
  const compensation = normalizeCompensation(value);
  if (!compensation) return true;
  const period = filter.period ?? DEFAULT_FILTER_PERIOD;
  const taxBasis = filter.taxBasis ?? 'unknown';
  // LEGACY(parser-pipeline): any unit mismatch keeps the job. Period, tax basis and currency must
  // all be explicit and equal before a bound can reject it; unknown is never guessed.
  const comparable =
    compensation.period !== 'unknown' &&
    compensation.period === period &&
    taxBasis !== 'unknown' &&
    compensation.taxBasis === taxBasis &&
    filter.currency &&
    compensation.currency === filter.currency.toUpperCase();
  if (!comparable) return true;
  const low = compensation.min ?? 0;
  const high = compensation.max ?? Infinity;
  const belowFilterMin = Number(filter.min ?? 0) > high;
  // LEGACY(parser-pipeline): a filter max of 0 or unset means "no upper bound", not "at most 0".
  const aboveFilterMax = Number(filter.max ?? 0) > 0 && Number(filter.max) < low;
  return !(belowFilterMin || aboveFilterMax);
}

/**
 * @param {Compensation} c
 * @returns {string} "100-200", "from 100", "up to 200", "5" or empty.
 */
function rangeText(c) {
  if (c.min !== undefined && c.max !== undefined) return c.min === c.max ? `${c.min}` : `${c.min}-${c.max}`;
  if (c.min !== undefined) return `from ${c.min}`;
  if (c.max !== undefined) return `up to ${c.max}`;
  return '';
}

/**
 * Display text that states every unit, for notes and logs.
 * @param {unknown} value Compensation object.
 * @returns {string} Source `rawText` when there are no usable amounts.
 */
export function formatExplicitCompensation(value) {
  const c = normalizeCompensation(value);
  if (!c) return '';
  const range = rangeText(c);
  if (!range) return c.rawText;
  return `${range} ${c.currency} / ${c.period} (${c.taxBasis})`;
}
