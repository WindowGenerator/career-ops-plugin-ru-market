import { normalizedCompany, normalizedText } from './normalize.mjs';

export const sourceOf = job => /^source: ([a-z-]+)/.exec(job.note ?? '')?.[1] ?? '';
const label = id => ({ hh: 'HH', 'habr-career': 'Habr Career', geekjob: 'GeekJob', superjob: 'SuperJob', trudvsem: 'Работа России' })[id] ?? id;
function addNote(job, value) { if (!job.note.includes(value)) job.note += `; ${value}`; }

export function localDedup(jobs) {
  const found = new Map();
  for (const job of jobs) {
    // Adapters canonicalize URLs; board ID is the final path segment.
    const key = `${sourceOf(job)}:${new URL(job.url).pathname.split('/').at(-1)}`;
    if (!found.has(key)) found.set(key, { ...job });
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
  if (a.url === b.url) return 'high';
  if (sourceOf(a) === sourceOf(b)) return 'low';
  if (!a.company || !b.company || normalizedCompany(a.company) !== normalizedCompany(b.company)
    || normalizedText(a.title) !== normalizedText(b.title)) return 'low';
  if (a.location && b.location && normalizedText(a.location) !== normalizedText(b.location)) return 'low';
  if (a.postedAt && b.postedAt && Math.abs(a.postedAt - b.postedAt) > 14 * 86400_000) return 'low';
  const score = similarity(a.description, b.description);
  if (score !== undefined && score < 0.45) return 'low';
  const salaryConflict = a.salary && b.salary && (a.salary.currency !== b.salary.currency
    || (a.salary.to !== undefined && b.salary.from !== undefined && a.salary.to < b.salary.from)
    || (b.salary.to !== undefined && a.salary.from !== undefined && b.salary.to < a.salary.from));
  if (salaryConflict) return 'low';
  return a.location && b.location && score >= 0.85 ? 'high' : 'medium';
}

export function deduplicate(jobs, order = ['hh', 'habr-career', 'geekjob']) {
  const ranked = localDedup(jobs).sort((a, b) => order.indexOf(sourceOf(a)) - order.indexOf(sourceOf(b)));
  const groups = [];
  for (const job of ranked) {
    // Complete-link comparison avoids transitive merges of distinct openings.
    const group = groups.find(g => g.members.every(member => confidence(member, job) === 'high'));
    if (group) {
      group.members.push(job);
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
