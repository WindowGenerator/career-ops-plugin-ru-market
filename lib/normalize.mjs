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
  const host = { hh: 'hh.ru', 'habr-career': 'career.habr.com', geekjob: 'geekjob.ru' }[source];
  try {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const url = new URL(decode(value), `https://${host}`);
    const pattern = source === 'habr-career' ? /^\/vacancies\/\d+\/?$/
      : source === 'hh' ? /^\/vacancy\/\d+\/?$/ : /^\/vacancy\/[a-f0-9]{24}\/?$/i;
    if (url.hostname !== host || url.protocol !== 'https:' || url.username || url.password || url.port || !pattern.test(url.pathname)) return undefined;
    return `https://${host}${url.pathname.replace(/\/$/, '')}`;
  } catch { return undefined; }
}

export function structuredSalary(value) {
  if (!value || typeof value !== 'object') return undefined;
  const currency = value.currency === 'RUR' ? 'RUB' : value.currency;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined;
  const salary = { currency };
  for (const key of ['from', 'to']) if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) salary[key] = value[key];
  if (salary.from === undefined && salary.to === undefined) return undefined;
  if (salary.from !== undefined && salary.to !== undefined && salary.from > salary.to) return undefined;
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
  const salary = amounts.length === 2 ? { from: amounts[0], to: amounts[1], currency }
    : /(?:^|\s)(?:до|up to)\s/i.test(text) ? { to: amounts[0], currency }
    : /(?:^|\s)(?:от|from)\s/i.test(text) ? { from: amounts[0], currency }
    : { from: amounts[0], to: amounts[0], currency };
  return structuredSalary(salary);
}

export function makeJob(source, values) {
  const title = clean(values.title);
  const url = jobUrl(values.url, source);
  if (!title || !url) return null;
  const job = { title, url, company: clean(values.company), location: clean(values.location), note: `source: ${source}` };
  if (values.description) job.description = plainText(values.description);
  const date = parseDate(values.date, values.now);
  if (date !== undefined) job.postedAt = date;
  if (values.salary) job.salary = values.salary;
  if (values.salaryText) job.note += `; salary: ${clean(values.salaryText)}`;
  return job;
}

export const normalizedText = value => clean(value).normalize('NFKC').toLowerCase().replace(/[«»„“”"']/g, '').replace(/[.,!?:;()]/g, ' ').replace(/\s+/g, ' ').trim();
export function normalizedCompany(value) {
  const original = normalizedText(value);
  const result = original.replace(/^(?:ооо|оао|пао|зао|ао)\s+/u, '').replace(/\s+(?:llc|ltd|inc|gmbh|limited|ооо|оао|пао|зао|ао)$/u, '').trim();
  return result || original;
}
