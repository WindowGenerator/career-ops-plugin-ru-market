// Normalisation: turns raw listing fields into the shared Job shape.
//
// Every provider ends in makeJob(). It sanitises untrusted text, validates the
// canonical vacancy URL, parses dates and salaries, and fills the fixed set of
// fields the core scanner expects. Small text helpers used across the plugin
// (clean, decode, plainText, normalizedText, ...) live here as well.
import { compensationFromSalary, normalizeCompensation } from './compensation.mjs';
import { untrusted, limit } from '../untrusted.mjs';

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', laquo: '«', raquo: '»', rub: '₽',
};
const MAX_CODE_POINT = 0x10ffff;
const MS_PER_HOUR = 3600_000;
const MS_PER_DAY = 86400_000;
const MOSCOW_OFFSET_HOURS = 3;

/**
 * Collapse whitespace and trim.
 * @param {unknown} value
 * @returns {string} Empty string for non-strings.
 */
export const clean = value => (typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '');

/**
 * @param {number} codePoint
 * @returns {boolean} True for a usable Unicode scalar value.
 */
function isScalarValue(codePoint) {
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
  return codePoint > 0 && codePoint <= MAX_CODE_POINT && !isSurrogate;
}

/**
 * Decode named, decimal and hexadecimal HTML entities; unknown ones stay as written.
 * @param {unknown} value
 * @returns {string}
 */
export function decode(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
    const isHex = name[1].toLowerCase() === 'x';
    const codePoint = isHex ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return isScalarValue(codePoint) ? String.fromCodePoint(codePoint) : whole;
  });
}

/**
 * Strip tags, script and style, decode entities, collapse whitespace.
 * @param {unknown} value HTML or plain text.
 * @returns {string}
 */
export function plainText(value) {
  const withoutCode = String(value ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  return clean(decode(withoutCode.replace(/<[^>]*>/g, ' ')));
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];
const UPDATED_LABEL = /обнов|updated|поднят/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:t(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(z|[+-]\d{2}:?\d{2}))?$/i;
const RUSSIAN_DATE = /(?:^|[^\d])(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?(?=$|[^\p{L}\d])/u;

/**
 * @param {string[]} iso Regex groups of ISO_DATE.
 * @param {string} text Lower-cased source text.
 * @returns {number | undefined} Epoch ms; undefined for impossible calendar dates.
 */
function parseIsoDate(iso, text) {
  const [year, month, day] = iso.slice(1, 4).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  const valid = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  if (!valid) return undefined;
  // A date without a time or zone is midnight Moscow time.
  const ms = Date.parse(iso[4] ? text : `${text}T00:00:00+03:00`);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * @param {string[]} match Regex groups of RUSSIAN_DATE.
 * @param {number} now Epoch ms.
 * @returns {number | undefined} Epoch ms of local midnight; undefined for unknown months or days.
 */
function parseRussianDate(match, now) {
  const month = MONTHS.indexOf(match[2]);
  const day = Number(match[1]);
  if (month < 0 || day < 1 || day > 31) return undefined;
  const moscowOffset = MOSCOW_OFFSET_HOURS * MS_PER_HOUR;
  let year = match[3] ? Number(match[3]) : new Date(now + moscowOffset).getUTCFullYear();
  // A day-month without a year more than a day in the future belongs to last year.
  if (!match[3] && Date.UTC(year, month, day) - moscowOffset > now + MS_PER_DAY) year--;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return undefined;
  return date.getTime() - moscowOffset;
}

/**
 * Parse an ISO date or a Russian "5 октября [2026]" date.
 * @param {unknown} value
 * @param {number} [now] Epoch ms, for dates without a year.
 * @returns {number | undefined} Epoch ms; undefined for missing, "updated" or invalid dates.
 */
export function parseDate(value, now = Date.now()) {
  const text = clean(value).toLowerCase();
  if (!text || UPDATED_LABEL.test(text)) return undefined;
  const iso = text.match(ISO_DATE);
  if (iso) return parseIsoDate(iso, text);
  const russian = text.match(RUSSIAN_DATE);
  return russian ? parseRussianDate(russian, now) : undefined;
}

const SOURCE_HOSTS = {
  'habr-career': 'career.habr.com', geekjob: 'geekjob.ru', superjob: 'www.superjob.ru',
  trudvsem: 'trudvsem.ru', getmatch: 'getmatch.ru', 'helloworld-rs': 'www.helloworld.rs',
};
/** Accepted vacancy paths per source; anything else is not a vacancy card link. */
const VACANCY_PATHS = {
  'helloworld-rs': /^\/posao\/[^/]+\/[^/]+\/[1-9]\d*\/?$/,
  'habr-career': /^\/vacancies\/\d+\/?$/,
  geekjob: /^\/vacancy\/[a-f0-9]{24}\/?$/i,
  superjob: /^\/vakansii\/[a-z0-9-]+-\d+(?:-\d+)?\.html$/i,
  getmatch: /^\/vacancies\/[1-9]\d*-[a-z0-9]+(?:-[a-z0-9]+)*\/?$/i,
  trudvsem: /^\/vacancy\/card\/[a-z0-9-]+\/[a-f0-9-]+\/?$/i,
};
const NO_MATCH = /^$/;

/**
 * Canonical vacancy URL: https, the source's own host, a vacancy path, no query.
 * @param {unknown} value Raw href or absolute URL.
 * @param {string} source Provider id.
 * @returns {string | undefined} Undefined when the link is not a vacancy of that source.
 */
export function jobUrl(value, source) {
  const host = SOURCE_HOSTS[source];
  try {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const url = new URL(decode(value), `https://${host}`);
    const pattern = VACANCY_PATHS[source] ?? NO_MATCH;
    const plain = url.protocol === 'https:' && !url.username && !url.password && !url.port;
    if (url.hostname !== host || !plain || !pattern.test(url.pathname)) return undefined;
    return `https://${host}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return undefined;
  }
}

/**
 * Validate a structured salary object from an API.
 * @param {any} value `{ min|from, max|to, currency }`.
 * @returns {{ currency: string, min?: number, max?: number } | undefined}
 *   Undefined for bad currency, no amounts, negative amounts or min > max.
 */
export function structuredSalary(value) {
  if (!value || typeof value !== 'object') return undefined;
  const currency = value.currency === 'RUR' ? 'RUB' : value.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined;
  const salary = { currency };
  for (const [key, alias] of [['min', 'from'], ['max', 'to']]) {
    const amount = value[key] ?? value[alias];
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) salary[key] = amount;
  }
  if (salary.min === undefined && salary.max === undefined) return undefined;
  if (salary.min !== undefined && salary.max !== undefined && salary.min > salary.max) return undefined;
  return salary;
}

const SALARY_NOT_STATED = /не указана|договор|похож|примерн|прогноз|predicted|estimate/i;
const SALARY_AMOUNT = /\d+(?:[  ]\d{3})*(?:[.,]\d+)?\s*(?:[kк]|тыс\.?)?/gi;
const THOUSANDS_SUFFIX = /(?:[kк]|тыс\.?)$/i;

/**
 * LEGACY(parser-pipeline): the same currency regex chain is repeated in compensation.mjs
 * (parseCompensation) with a slightly different RUB pattern; both copies are left as they are.
 * @param {string} text
 * @returns {string | undefined}
 */
function salaryCurrency(text) {
  if (/₽|руб\.?|\bRU[BR]\b/i.test(text)) return 'RUB';
  if (/\$|\bUSD\b/.test(text)) return 'USD';
  if (/€|\bEUR\b/.test(text)) return 'EUR';
  if (/₸|\bKZT\b/.test(text)) return 'KZT';
  if (/\bBYN\b/.test(text)) return 'BYN';
  return undefined;
}

/**
 * Read a salary string such as "от 100 000 до 200 000 ₽" or "3k USD".
 * @param {unknown} value
 * @returns {{ currency: string, min?: number, max?: number } | undefined}
 *   Undefined for estimates, "not stated", no currency, or more than two amounts.
 */
export function parseSalary(value) {
  const text = clean(value);
  if (SALARY_NOT_STATED.test(text)) return undefined;
  const currency = salaryCurrency(text);
  if (!currency) return undefined;
  const amounts = [...text.matchAll(SALARY_AMOUNT)].map(match => {
    const raw = match[0];
    const digits = raw.replace(/\s/g, '').replace(THOUSANDS_SUFFIX, '').replace(',', '.');
    return Number(digits) * (/[kк]|тыс/i.test(raw) ? 1000 : 1);
  });
  if (!amounts.length || amounts.length > 2) return undefined;
  return structuredSalary(salaryBounds(text, amounts, currency));
}

/**
 * @param {string} text Whole salary text, for the leading "from"/"up to" word.
 * @param {number[]} amounts One or two amounts.
 * @param {string} currency
 * @returns {{ currency: string, min?: number, max?: number }}
 */
function salaryBounds(text, amounts, currency) {
  if (amounts.length === 2) return { min: amounts[0], max: amounts[1], currency };
  if (/^(?:до|up to)\s/i.test(text)) return { max: amounts[0], currency };
  if (/^(?:от|from)\s/i.test(text)) return { min: amounts[0], currency };
  return { min: amounts[0], max: amounts[0], currency };
}

const EMPLOYMENT = {
  'полная занятость': 'full',
  'частичная занятость': 'part',
  'проектная работа': 'project',
  'стажировка': 'probation',
  'волонтерство': 'volunteer',
};
const API_SOURCES = ['superjob', 'trudvsem', 'getmatch'];
const SENIORITY_LEVELS = ['intern', 'entry', 'mid', 'senior'];

/**
 * Sanitiser that records which injection flags were seen across all fields.
 * @returns {{ safe: (value: unknown, field: string) => string, flags: Set<string> }}
 */
function createSanitizer() {
  const flags = new Set();
  const safe = (value, field) => {
    const result = untrusted(value, field);
    result.flags.forEach(flag => flags.add(flag));
    return result.text;
  };
  return { safe, flags };
}

/**
 * @param {unknown} location Sanitised location text.
 * @returns {'hybrid' | 'remote' | 'unknown'}
 */
function arrangementFromLocation(location) {
  if (/гибрид|hybrid/i.test(location)) return 'hybrid';
  if (/удал[её]н|remote/i.test(location)) return 'remote';
  return 'unknown';
}

/**
 * @param {string} source
 * @param {string} url Canonical vacancy URL.
 * @returns {string | undefined} The id the source uses for the vacancy.
 */
function sourceIdOf(source, url) {
  if (source === 'getmatch') return /\/vacancies\/(\d+)-/.exec(url)?.[1];
  return new URL(url).pathname.split('/').at(-1);
}

/**
 * Compensation: an explicit object wins, otherwise derive it from salary and text.
 * @param {any} values makeJob input.
 * @returns {object | undefined}
 */
function compensationOf(values) {
  if (values.compensation) return normalizeCompensation(values.compensation);
  if (values.salary || values.salaryText) {
    return compensationFromSalary(values.salary, values.salaryText, values.salaryPeriod, values.taxBasis);
  }
  return undefined;
}

/**
 * Attach `employment` and `professional_role`, taken only from explicit source labels.
 * @param {object} job Job under construction.
 * @param {any} values makeJob input.
 * @param {(input: unknown) => string[]} list Sanitising unique-string list reader.
 */
function addLabelFields(job, values, list) {
  for (const key of ['employment', 'professional_role']) {
    const labels = list(values[key]?.rawLabels);
    const known = key === 'employment'
      ? labels.map(x => EMPLOYMENT[x.toLowerCase().replace(/ё/g, 'е')]).filter(Boolean)
      : [];
    const given = list(values[key]?.values);
    if (labels.length || given.length) {
      job[key] = { values: [...new Set([...given, ...known])], rawLabels: labels };
    }
  }
}

/**
 * Build a Job from raw listing fields.
 * @param {string} source Provider id, for example `habr-career`.
 * @param {object} values Raw fields: title, url, company, location, description, date,
 *   salary, salaryText, compensation, skills, seniority, employment, professional_role, ...
 * @returns {object | null} Null when there is no title or no valid vacancy URL.
 */
export function makeJob(source, values) {
  const { safe, flags } = createSanitizer();
  const title = clean(safe(values.title, 'title'));
  const url = jobUrl(values.url, source);
  if (!title || !url) return null;
  const job = {
    title, url,
    company: clean(safe(values.company, 'company')),
    location: clean(safe(values.location, 'location')),
    note: `source: ${source}`,
  };
  if (values.description) job.description = limit(plainText(safe(values.description, 'description')));
  const date = parseDate(values.date, values.now);
  if (date !== undefined) job.postedAt = date;
  if (values.salary) job.salary = values.salary;
  const compensation = compensationOf(values);
  if (compensation) job.compensation = compensation;
  job.source = source;
  job.transport = API_SOURCES.includes(source) ? 'api' : 'html';
  job.sourceId = sourceIdOf(source, url);
  const locationText = values.locationText === undefined ? job.location : safe(values.locationText, 'location');
  job.locationText = clean(locationText);
  job.locations = locationListOf(values, job, safe);
  job.workArrangement = values.workArrangement ?? arrangementFromLocation(job.location);
  const list = input => uniqueClean(input, safe);
  const skills = list(values.skills);
  if (skills.length) job.skills = skills;
  const rawLabels = list(values.seniority?.rawLabels);
  const levels = list(values.seniority?.levels).filter(x => SENIORITY_LEVELS.includes(x));
  if (rawLabels.length || levels.length) job.seniority = { levels, rawLabels };
  addLabelFields(job, values, list);
  job.eligibility = { status: 'unknown' };
  job.dataLevel = 'listing';
  job.hasDescription = Boolean(values.description);
  if (values.salaryText) {
    job.note = limit(`${job.note}; salary: ${clean(safe(values.salaryText, 'note'))}`, 'note');
  }
  if (flags.size) job.injectionFlags = [...flags].sort();
  return job;
}

/**
 * @param {unknown} input Array of raw labels.
 * @param {(value: unknown, field: string) => string} safe Sanitiser.
 * @returns {string[]} Sanitised, non-empty, unique items; empty for non-arrays.
 */
function uniqueClean(input, safe) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(x => clean(safe(x, 'item'))).filter(Boolean))];
}

/**
 * @param {any} values makeJob input.
 * @param {{ locationText: string }} job
 * @param {(value: unknown, field: string) => string} safe
 * @returns {string[]}
 */
function locationListOf(values, job, safe) {
  if (Array.isArray(values.locations)) {
    return values.locations.map(x => clean(safe(x, 'location'))).filter(Boolean);
  }
  return job.locationText ? [job.locationText] : [];
}

/**
 * Lower-case, NFKC-normalised text without quotes and sentence punctuation.
 * @param {unknown} value
 * @returns {string}
 */
export function normalizedText(value) {
  return clean(value).normalize('NFKC').toLowerCase()
    .replace(/[«»„“”"']/g, '')
    .replace(/[.,!?:;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const COMPANY_PREFIX = /^(?:ооо|оао|пао|зао|ао)\s+/u;
const COMPANY_SUFFIX = /\s+(?:llc|ltd|inc|gmbh|limited|ооо|оао|пао|зао|ао)$/u;

/**
 * Company name without its legal form, for comparing listings across sources.
 * @param {unknown} value
 * @returns {string} The full normalised name when stripping would leave nothing.
 */
export function normalizedCompany(value) {
  const original = normalizedText(value);
  const result = original.replace(COMPANY_PREFIX, '').replace(COMPANY_SUFFIX, '').trim();
  return result || original;
}
