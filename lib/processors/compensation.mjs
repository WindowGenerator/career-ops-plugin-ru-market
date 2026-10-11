// Explicit source units. No currency, tax or annualization conversion.
const tidy = value => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
export function normalizeCompensation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {
    period: ['month', 'year', 'hour', 'shift'].includes(value.period) ? value.period : 'unknown',
    taxBasis: ['gross', 'net'].includes(value.taxBasis) ? value.taxBasis : 'unknown',
    rawText: tidy(value.rawText),
  };
  if (typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency)) out.currency = value.currency === 'RUR' ? 'RUB' : value.currency;
  const supplied = ['min', 'max'].filter(k => value[k] !== undefined);
  const valid = supplied.length && supplied.every(k => typeof value[k] === 'number' && Number.isFinite(value[k]) && value[k] >= 0)
    && !(value.min !== undefined && value.max !== undefined && value.min > value.max);
  if (valid && out.currency) for (const key of supplied) out[key] = value[key];
  else if (supplied.length) out.diagnostic = 'invalid-amount-or-currency';
  if (typeof value.diagnostic === 'string') out.diagnostic = value.diagnostic;
  return out;
}
export function parseCompensation(rawText, currencyHint) {
  const raw = tidy(rawText);
  if (!raw) return undefined;
  const period = /(?:в|за) (?:месяц)|per month|\/month/i.test(raw) ? 'month'
    : /(?:в|за) год|per year|annual|\/year/i.test(raw) ? 'year'
    : /(?:в|за) час|per hour|\/hour/i.test(raw) ? 'hour'
    : /(?:за|в) смену|per shift/i.test(raw) ? 'shift' : 'unknown';
  const gross = /до вычета налогов|gross/i.test(raw), net = /на руки|net/i.test(raw);
  const taxBasis = gross && !net ? 'gross' : net && !gross ? 'net' : 'unknown';
  const detected = /₽|руб|\bRU[BR]\b/i.test(raw) ? 'RUB' : /\$|\bUSD\b/.test(raw) ? 'USD'
    : /€|\bEUR\b/.test(raw) ? 'EUR' : /₸|\bKZT\b/.test(raw) ? 'KZT' : /\bBYN\b/.test(raw) ? 'BYN' : undefined;
  const currency = currencyHint === 'RUR' ? 'RUB' : currencyHint || detected;
  const result = { rawText: raw, period, taxBasis, ...(currency ? { currency } : {}) };
  // Only the leading amount expression determines a bound; tax prose cannot.
  const amount = '(\\d+(?: \\d{3})*(?:[.,]\\d+)?)(?:\\s*(тыс\\.?|[kк]))?';
  const pattern = new RegExp(`^(?:(от|до|from|up to)\\s+)?${amount}(?:\\s*[–—-]\\s*${amount})?\\s*(₽|руб\\.?|RUB|RUR|USD|EUR|KZT|BYN|UZS|GEL|AMD|\\$|€|₸)(?=\\s|$|[,;])`, 'i');
  const match = pattern.exec(raw);
  if (!match || !currency || (detected && detected !== currency) || /не указ|договор|прогноз|похож|estimate|predicted/i.test(raw)) {
    return normalizeCompensation({ ...result, diagnostic: 'ambiguous-amount-or-currency' });
  }
  if (period === 'unknown' && /недел|сутк|день|week|day/i.test(raw)) return normalizeCompensation({ ...result, diagnostic: 'unsupported-period' });
  const number = (n, suffix) => Number(n.replace(/ /g, '').replace(',', '.')) * (suffix ? 1000 : 1);
  const first = number(match[2], match[3]), second = match[4] ? number(match[4], match[5]) : undefined;
  const bounds = second !== undefined ? { min: first, max: second }
    : /^(до|up to)$/i.test(match[1] ?? '') ? { max: first }
    : /^(от|from)$/i.test(match[1] ?? '') ? { min: first } : { min: first, max: first };
  return normalizeCompensation({ ...result, ...bounds });
}
export function compensationFromSalary(salary, rawText = '', period = 'unknown', taxBasis = 'unknown') {
  const text = parseCompensation(rawText);
  return normalizeCompensation({ rawText, period: text?.period !== 'unknown' ? text?.period ?? period : period,
    taxBasis: text?.taxBasis !== 'unknown' ? text?.taxBasis ?? taxBasis : taxBasis,
    currency: salary?.currency, ...(salary?.min !== undefined ? { min: salary.min } : {}),
    ...(salary?.max !== undefined ? { max: salary.max } : {}) });
}

export function compensationMatchesFilter(value, filter) {
  const compensation = normalizeCompensation(value);
  if (!compensation) return true;
  const period = filter.period ?? 'year', taxBasis = filter.taxBasis ?? 'unknown';
  // Units and tax basis must be explicitly comparable; unknown is not a guess.
  if (compensation.period === 'unknown' || compensation.period !== period || taxBasis === 'unknown'
    || compensation.taxBasis !== taxBasis || !filter.currency || compensation.currency !== filter.currency.toUpperCase()) return true;
  const low = compensation.min ?? 0, high = compensation.max ?? Infinity;
  return !(Number(filter.min ?? 0) > high || (Number(filter.max ?? 0) > 0 && Number(filter.max) < low));
}
export function formatExplicitCompensation(value) {
  const c = normalizeCompensation(value);
  if (!c) return '';
  const range = c.min !== undefined && c.max !== undefined ? c.min === c.max ? `${c.min}` : `${c.min}-${c.max}`
    : c.min !== undefined ? `from ${c.min}` : c.max !== undefined ? `up to ${c.max}` : '';
  if (!range) return c.rawText;
  return `${range} ${c.currency} / ${c.period} (${c.taxBasis})`;
}
