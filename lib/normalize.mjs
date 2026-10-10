import { compensationFromSalary, normalizeCompensation } from './compensation.mjs';
import { untrusted, limit } from './untrusted.mjs';
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', laquo: '«', raquo: '»', rub: '₽' };
export const clean = value => typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
export function decode(value) {
  return String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return entities[name.toLowerCase()] ?? whole;
    const cp = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : whole;
  });
}
export const plainText = value => clean(decode(String(value ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')));

const months = 'января февраля марта апреля мая июня июля августа сентября октября ноября декабря'.split(' ');
export function parseDate(value, now = Date.now()) {
  const text = clean(value).toLowerCase();
  if (!text || /обнов|updated|поднят/.test(text)) return undefined;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:t(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(z|[+-]\d{2}:?\d{2}))?$/i);
  if (iso) {
    const [year, month, day] = iso.slice(1, 4).map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
    const ms = Date.parse(iso[4] ? text : `${text}T00:00:00+03:00`);
    return Number.isFinite(ms) ? ms : undefined;
  }
  const match = text.match(/(?:^|[^\d])(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?(?=$|[^\p{L}\d])/u);
  if (!match) return undefined;
  const month = months.indexOf(match[2]);
  const day = Number(match[1]);
  if (month < 0 || day < 1 || day > 31) return undefined;
  let year = match[3] ? Number(match[3]) : new Date(now + 3 * 3600_000).getUTCFullYear();
  if (!match[3] && Date.UTC(year, month, day) - 3 * 3600_000 > now + 86400_000) year--;
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return undefined;
  return date.getTime() - 3 * 3600_000;
}

export function jobUrl(value, source) {
  const host = { 'habr-career': 'career.habr.com', geekjob: 'geekjob.ru', superjob: 'www.superjob.ru', trudvsem: 'trudvsem.ru', getmatch: 'getmatch.ru', 'helloworld-rs': 'www.helloworld.rs' }[source];
  try {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const url = new URL(decode(value), `https://${host}`);
    const pattern = source === 'helloworld-rs' ? /^\/posao\/[^/]+\/[^/]+\/[1-9]\d*\/?$/
      : source === 'habr-career' ? /^\/vacancies\/\d+\/?$/
      : source === 'geekjob' ? /^\/vacancy\/[a-f0-9]{24}\/?$/i
      : source === 'superjob' ? /^\/vakansii\/[a-z0-9-]+-\d+(?:-\d+)?\.html$/i
      : source === 'getmatch' ? /^\/vacancies\/[1-9]\d*-[a-z0-9]+(?:-[a-z0-9]+)*\/?$/i
      : source === 'trudvsem' ? /^\/vacancy\/card\/[a-z0-9-]+\/[a-f0-9-]+\/?$/i : /^$/;
    if (url.hostname !== host || url.protocol !== 'https:' || url.username || url.password || url.port || !pattern.test(url.pathname)) return undefined;
    return `https://${host}${url.pathname.replace(/\/$/, '')}`;
  } catch { return undefined; }
}

export function structuredSalary(value) {
  if (!value || typeof value !== 'object') return undefined;
  const currency = value.currency === 'RUR' ? 'RUB' : value.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined;
  const salary = { currency };
  for (const [key, input] of [['min', 'from'], ['max', 'to']]) {
    const amount = value[key] ?? value[input];
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) salary[key] = amount;
  }
  if (salary.min === undefined && salary.max === undefined) return undefined;
  if (salary.min !== undefined && salary.max !== undefined && salary.min > salary.max) return undefined;
  return salary;
}

export function parseSalary(value) {
  const text = clean(value);
  if (/не указана|договор|похож|примерн|прогноз|predicted|estimate/i.test(text)) return undefined;
  const currency = /₽|руб\.?|\bRU[BR]\b/i.test(text) ? 'RUB' : /\$|\bUSD\b/.test(text) ? 'USD'
    : /€|\bEUR\b/.test(text) ? 'EUR' : /₸|\bKZT\b/.test(text) ? 'KZT' : /\bBYN\b/.test(text) ? 'BYN' : undefined;
  if (!currency) return undefined;
  const amounts = [...text.matchAll(/\d+(?:[ \u00a0]\d{3})*(?:[.,]\d+)?\s*(?:[kк]|тыс\.?)?/gi)].map(m => {
    const raw = m[0];
    return Number(raw.replace(/\s/g, '').replace(/(?:[kк]|тыс\.?)$/i, '').replace(',', '.')) * (/[kк]|тыс/i.test(raw) ? 1000 : 1);
  });
  if (!amounts.length || amounts.length > 2) return undefined;
  const salary = amounts.length === 2 ? { min: amounts[0], max: amounts[1], currency }
    : /^(?:до|up to)\s/i.test(text) ? { max: amounts[0], currency }
    : /^(?:от|from)\s/i.test(text) ? { min: amounts[0], currency }
    : { min: amounts[0], max: amounts[0], currency };
  return structuredSalary(salary);
}

const EMPLOYMENT = { 'полная занятость': 'full', 'частичная занятость': 'part', 'проектная работа': 'project', 'стажировка': 'probation', 'волонтерство': 'volunteer' };
export function makeJob(source, values) {
  const flags = new Set();
  const safe = (value, field) => { const result = untrusted(value, field); result.flags.forEach(flag => flags.add(flag)); return result.text; };
  const title = clean(safe(values.title, 'title'));
  const url = jobUrl(values.url, source);
  if (!title || !url) return null;
  const job = { title, url, company: clean(safe(values.company, 'company')), location: clean(safe(values.location, 'location')), note: `source: ${source}` };
  if (values.description) job.description = limit(plainText(safe(values.description, 'description')));
  const date = parseDate(values.date, values.now);
  if (date !== undefined) job.postedAt = date;
  if (values.salary) job.salary = values.salary;
  const compensation = values.compensation ? normalizeCompensation(values.compensation)
    : (values.salary || values.salaryText) ? compensationFromSalary(values.salary, values.salaryText, values.salaryPeriod, values.taxBasis) : undefined;
  if (compensation) job.compensation = compensation;
  job.source = source;
  job.transport = ['superjob', 'trudvsem', 'getmatch'].includes(source) ? 'api' : 'html';
  job.sourceId = source === 'getmatch' ? /\/vacancies\/(\d+)-/.exec(url)?.[1] : new URL(url).pathname.split('/').at(-1);
  job.locationText = clean(values.locationText === undefined ? job.location : safe(values.locationText, 'location'));
  job.locations = Array.isArray(values.locations) ? values.locations.map(x => clean(safe(x, 'location'))).filter(Boolean) : job.locationText ? [job.locationText] : [];
  job.workArrangement = values.workArrangement ?? (/гибрид|hybrid/i.test(job.location) ? 'hybrid' : /удал[её]н|remote/i.test(job.location) ? 'remote' : 'unknown');
  const list = values => [...new Set(Array.isArray(values) ? values.map(x => clean(safe(x, 'item'))).filter(Boolean) : [])];
  const skills = list(values.skills);
  if (skills.length) job.skills = skills;
  const rawLabels = list(values.seniority?.rawLabels);
  const levels = list(values.seniority?.levels).filter(x => ['intern', 'entry', 'mid', 'senior'].includes(x));
  if (rawLabels.length || levels.length) job.seniority = { levels, rawLabels };
  // Only explicit source labels; the shape matches seniority. Absent means unknown.
  for (const key of ['employment', 'professional_role']) {
    const labels = list(values[key]?.rawLabels);
    const known = key === 'employment' ? labels.map(x => EMPLOYMENT[x.toLowerCase().replace(/ё/g, 'е')]).filter(Boolean) : [];
    const given = list(values[key]?.values);
    if (labels.length || given.length) job[key] = { values: [...new Set([...given, ...known])], rawLabels: labels };
  }
  job.eligibility = { status: 'unknown' };
  job.dataLevel = 'listing';
  job.hasDescription = Boolean(values.description);
  if (values.salaryText) job.note = limit(`${job.note}; salary: ${clean(safe(values.salaryText, 'note'))}`, 'note');
  if (flags.size) job.injectionFlags = [...flags].sort();
  return job;
}

export const normalizedText = value => clean(value).normalize('NFKC').toLowerCase().replace(/[«»„“”"']/g, '').replace(/[.,!?:;()]/g, ' ').replace(/\s+/g, ' ').trim();
export function normalizedCompany(value) {
  const original = normalizedText(value);
  const result = original.replace(/^(?:ооо|оао|пао|зао|ао)\s+/u, '').replace(/\s+(?:llc|ltd|inc|gmbh|limited|ооо|оао|пао|зао|ао)$/u, '').trim();
  return result || original;
}
