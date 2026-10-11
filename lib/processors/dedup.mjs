// Deduplication: the same vacancy seen twice.
//
// localDedup() merges repeats of one posting inside a single source (several
// queries or pages). deduplicate() merges a posting listed on several boards:
// pairs are scored by confidence(), `high` pairs are merged into the listing of
// the preferred source, `medium` pairs are only annotated with a note.
import { normalizedCompany, normalizedText } from './normalize.mjs';

const MS_PER_DAY = 86400_000;
const MAX_POSTED_GAP_MS = 14 * MS_PER_DAY;
const MIN_TOKENS_TO_COMPARE = 12;
const LOW_SIMILARITY = 0.45;
const HIGH_SIMILARITY = 0.85;

/**
 * @param {{ note?: string }} job
 * @returns {string} The source id written in the note, or empty.
 */
export const sourceOf = job =>
  /^source: ([a-z-]+)/.exec(job.note ?? '')?.[1] ?? '';

/**
 * LEGACY(parser-pipeline): helloworld-rs has no entry here, so its notes show the raw id
 * (`cross-listed: helloworld-rs <url>`). Pinned by a test; the name is not added.
 * @param {string} id Source id.
 * @returns {string} Display name used in notes.
 */
function label(id) {
  const names = {
    'habr-career': 'Habr Career',
    geekjob: 'GeekJob',
    superjob: 'SuperJob',
    trudvsem: 'Работа России',
    getmatch: 'getmatch',
  };
  return names[id] ?? id;
}

/**
 * Append `; value` to the job note unless it is already there. Mutates `job`.
 * @param {{ note: string }} job
 * @param {string} value
 */
function addNote(job, value) {
  if (!job.note.includes(value)) job.note += `; ${value}`;
}

/**
 * @param {{ url: string, note?: string }} job
 * @returns {string} `source:id`; getmatch uses the numeric id, others the last path segment.
 */
function postingIdentity(job) {
  const source = sourceOf(job);
  const path = new URL(job.url).pathname;
  const id =
    source === 'getmatch'
      ? /^\/vacancies\/(\d+)-/.exec(path)?.[1]
      : path.split('/').at(-1);
  return `${source}:${id}`;
}

/**
 * @param {Array<{ queryId: string }>} first
 * @param {Array<{ queryId: string }>} second
 * @returns {Array<{ queryId: string }>} Union by queryId.
 */
function unionQueries(first, second) {
  const byId = new Map(
    [...first, ...second].map(query => [query.queryId, query]),
  );
  return [...byId.values()];
}

/**
 * Merge repeats of one posting inside a source, keeping every matched query.
 * @param {object[]} jobs
 * @returns {object[]} New objects; the input jobs are not mutated.
 */
export function localDedup(jobs) {
  const found = new Map();
  for (const job of jobs) {
    const key = postingIdentity(job);
    if (!found.has(key)) {
      found.set(key, { ...job });
      continue;
    }
    const previous = found.get(key);
    previous.matchedQueries = unionQueries(
      previous.matchedQueries ?? [],
      job.matchedQueries ?? [],
    );
  }
  return [...found.values()];
}

/**
 * Jaccard similarity of two descriptions.
 * @param {string} a
 * @param {string} b
 * @returns {number | undefined} Undefined when either text has fewer than 12 distinct tokens.
 */
function similarity(a, b) {
  const tokens = text =>
    new Set(normalizedText(text).match(/[\p{L}\p{N}+#]+/gu) ?? []);
  const left = tokens(a);
  const right = tokens(b);
  if (Math.min(left.size, right.size) < MIN_TOKENS_TO_COMPARE) return undefined;
  const intersection = [...left].filter(token => right.has(token)).length;
  return intersection / (left.size + right.size - intersection);
}

/**
 * @param {{ currency: string, min?: number, max?: number } | undefined} a
 * @param {{ currency: string, min?: number, max?: number } | undefined} b
 * @returns {boolean} True when both salaries exist and cannot be the same offer.
 */
function salariesConflict(a, b) {
  if (!a || !b) return false;
  const aAboveB = b.max !== undefined && a.min !== undefined && b.max < a.min;
  const bAboveA = a.max !== undefined && b.min !== undefined && a.max < b.min;
  return a.currency !== b.currency || bAboveA || aAboveB;
}

/**
 * Are these two jobs the same vacancy?
 * @param {object} a
 * @param {object} b
 * @returns {'high' | 'medium' | 'low'} `high` = same posting, `medium` = probably the same
 *   but unproven, `low` = different.
 */
export function confidence(a, b) {
  const sameGetmatch =
    sourceOf(a) === 'getmatch' &&
    sourceOf(b) === 'getmatch' &&
    postingIdentity(a) === postingIdentity(b);
  if (a.url === b.url || sameGetmatch) return 'high';
  if (sourceOf(a) === sourceOf(b)) return 'low';
  const differentCompany =
    !a.company ||
    !b.company ||
    normalizedCompany(a.company) !== normalizedCompany(b.company);
  if (differentCompany || normalizedText(a.title) !== normalizedText(b.title))
    return 'low';
  if (
    a.location &&
    b.location &&
    normalizedText(a.location) !== normalizedText(b.location)
  )
    return 'low';
  // LEGACY(parser-pipeline): a postedAt of 0 counts as "missing" here because of the truthiness check.
  if (
    a.postedAt &&
    b.postedAt &&
    Math.abs(a.postedAt - b.postedAt) > MAX_POSTED_GAP_MS
  )
    return 'low';
  const score = similarity(a.description, b.description);
  if (score !== undefined && score < LOW_SIMILARITY) return 'low';
  if (salariesConflict(a.salary, b.salary)) return 'low';
  return a.location && b.location && score >= HIGH_SIMILARITY
    ? 'high'
    : 'medium';
}

/**
 * Fold a cross-listed duplicate into the kept listing of its group.
 * @param {{ job: object, members: object[] }} group
 * @param {object} duplicate
 */
function mergeInto(group, duplicate) {
  group.members.push(duplicate);
  if (duplicate.injectionFlags) {
    const flags = new Set([
      ...(group.job.injectionFlags ?? []),
      ...duplicate.injectionFlags,
    ]);
    group.job.injectionFlags = [...flags].sort();
  }
  addNote(
    group.job,
    `cross-listed: ${label(sourceOf(duplicate))} ${duplicate.url}`,
  );
  // LEGACY(parser-pipeline): the donor's salary note is recovered by splitting its note on
  // '; salary: ' (everything after the marker, including any later notes). Not structured data.
  if (duplicate.note.includes('; salary: ')) {
    addNote(
      group.job,
      `${label(sourceOf(duplicate))} salary: ${duplicate.note.split('; salary: ')[1]}`,
    );
  }
}

/**
 * @param {{ note: string }} job Listing that receives the notes.
 * @param {object[]} members Possible duplicates of that listing.
 */
function noteMembers(job, members) {
  for (const member of members) {
    addNote(
      job,
      `possible cross-listing: ${label(sourceOf(member))} ${member.url}`,
    );
  }
}

/**
 * Add "possible cross-listing" notes between groups that only match with `medium` confidence.
 * @param {Array<{ job: object, members: object[] }>} groups Mutated through `job.note`.
 */
function annotatePossibleDuplicates(groups) {
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i];
      const b = groups[j];
      const possible = a.members.some(x =>
        b.members.some(y => confidence(x, y) === 'medium'),
      );
      if (!possible) continue;
      noteMembers(a.job, b.members);
      noteMembers(b.job, a.members);
    }
  }
}

/**
 * Merge postings listed on several sources.
 * @param {object[]} jobs Jobs from all sources.
 * @param {string[]} [order] Source ids, preferred listing first.
 * @returns {object[]} One job per posting; the input jobs are not mutated.
 */
export function deduplicate(jobs, order = ['habr-career', 'geekjob']) {
  // LEGACY(parser-pipeline): a source missing from `order` has indexOf -1 and therefore sorts
  // first, ahead of the listed sources. Callers pass the full order from config.
  const ranked = localDedup(jobs).sort(
    (a, b) => order.indexOf(sourceOf(a)) - order.indexOf(sourceOf(b)),
  );
  const groups = [];
  for (const job of ranked) {
    // Complete-link comparison avoids transitive merges of distinct openings.
    const group = groups.find(g =>
      g.members.every(member => confidence(member, job) === 'high'),
    );
    if (group) mergeInto(group, job);
    else groups.push({ job: { ...job }, members: [job] });
  }
  annotatePossibleDuplicates(groups);
  return groups.map(g => g.job);
}
