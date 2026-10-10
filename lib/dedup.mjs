import { normalizedCompany, normalizedText } from './normalize.mjs';

export const sourceOf = job => /^source: ([a-z-]+)/.exec(job.note ?? '')?.[1] ?? '';
const label = id => ({ 'habr-career': 'Habr Career', geekjob: 'GeekJob', superjob: 'SuperJob', trudvsem: 'Работа России', getmatch: 'getmatch' })[id] ?? id;
function addNote(job, value) { if (!job.note.includes(value)) job.note += `; ${value}`; }

function postingIdentity(job) {
  const source = sourceOf(job);
  const path = new URL(job.url).pathname;
  const id = source === 'getmatch' ? /^\/vacancies\/(\d+)-/.exec(path)?.[1] : path.split('/').at(-1);
  return `${source}:${id}`;
}

export function localDedup(jobs) {
  const found = new Map();
  for (const job of jobs) {
    const key = postingIdentity(job);
    if (!found.has(key)) found.set(key, { ...job });
    else {
      const previous = found.get(key);
      previous.matchedQueries = [...new Map([...(previous.matchedQueries ?? []), ...(job.matchedQueries ?? [])].map(q => [q.queryId, q])).values()];
    }
  }
  return [...found.values()];
}
function similarity(a, b) {
  const tokens = s => new Set(normalizedText(s).match(/[\p{L}\p{N}+#]+/gu) ?? []);
  const left = tokens(a), right = tokens(b);
  if (Math.min(left.size, right.size) < 12) return undefined;
  const intersection = [...left].filter(x => right.has(x)).length;
  return intersection / (left.size + right.size - intersection);
}
export function confidence(a, b) {
  if (a.url === b.url || (sourceOf(a) === 'getmatch' && sourceOf(b) === 'getmatch' && postingIdentity(a) === postingIdentity(b))) return 'high';
  if (sourceOf(a) === sourceOf(b)) return 'low';
  if (!a.company || !b.company || normalizedCompany(a.company) !== normalizedCompany(b.company)
    || normalizedText(a.title) !== normalizedText(b.title)) return 'low';
  if (a.location && b.location && normalizedText(a.location) !== normalizedText(b.location)) return 'low';
  if (a.postedAt && b.postedAt && Math.abs(a.postedAt - b.postedAt) > 14 * 86400_000) return 'low';
  const score = similarity(a.description, b.description);
  if (score !== undefined && score < 0.45) return 'low';
  const salaryConflict = a.salary && b.salary && (a.salary.currency !== b.salary.currency
    || (a.salary.max !== undefined && b.salary.min !== undefined && a.salary.max < b.salary.min)
    || (b.salary.max !== undefined && a.salary.min !== undefined && b.salary.max < a.salary.min));
  if (salaryConflict) return 'low';
  return a.location && b.location && score >= 0.85 ? 'high' : 'medium';
}

export function deduplicate(jobs, order = ['habr-career', 'geekjob']) {
  const ranked = localDedup(jobs).sort((a, b) => order.indexOf(sourceOf(a)) - order.indexOf(sourceOf(b)));
  const groups = [];
  for (const job of ranked) {
    // Complete-link comparison avoids transitive merges of distinct openings.
    const group = groups.find(g => g.members.every(member => confidence(member, job) === 'high'));
    if (group) {
      group.members.push(job);
      if (job.injectionFlags) group.job.injectionFlags = [...new Set([...(group.job.injectionFlags ?? []), ...job.injectionFlags])].sort();
      addNote(group.job, `cross-listed: ${label(sourceOf(job))} ${job.url}`);
      if (job.note.includes('; salary: ')) addNote(group.job, `${label(sourceOf(job))} salary: ${job.note.split('; salary: ')[1]}`);
    } else groups.push({ job: { ...job }, members: [job] });
  }
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
    const a = groups[i], b = groups[j];
    if (a.members.some(x => b.members.some(y => confidence(x, y) === 'medium'))) {
      for (const member of b.members) addNote(a.job, `possible cross-listing: ${label(sourceOf(member))} ${member.url}`);
      for (const member of a.members) addNote(b.job, `possible cross-listing: ${label(sourceOf(member))} ${member.url}`);
    }
  }
  return groups.map(g => g.job);
}
