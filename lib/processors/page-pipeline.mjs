// Page pipeline: the shared tail of every provider's page parser.
//
// Each provider turns one listing page (HTML or JSON) into jobs. The checks
// that come after the source-specific extraction are identical everywhere:
// build jobs with makeJob, drop invalid ones, refuse a page whose items are
// all invalid, merge duplicates. They live here once; a provider supplies a
// small adapter that knows only its own markup or JSON shape.
import { SourceError } from '../errors.mjs';
import { makeJob } from './normalize.mjs';
import { localDedup } from './dedup.mjs';

/**
 * @typedef {object} PageExtraction
 * @property {unknown[]} items Raw cards or records, in page order. An empty
 *   array is a legitimate empty page; the adapter must throw for a page it
 *   cannot recognise.
 * @property {boolean} hasNext Whether another page follows. Read after the
 *   items are mapped, so it may be a getter that is only evaluated then.
 * Any other property (ids, offsets, nextUrl, ...) is copied to the result.
 */

/**
 * @typedef {object} PageAdapter
 * @property {string} source Source id passed to makeJob.
 * @property {string} noValid Message of the broken-markup error raised when
 *   a page has items but none of them produce a job.
 * @property {(raw: any, ctx: any) => PageExtraction} extract Access and shape
 *   checks plus item and pagination discovery. Throws SourceError.
 * @property {(item: any, ctx: any) => object | null} values Maps one item to
 *   makeJob values; null skips the item.
 * @property {(job: object | null, item: any) => object | null} [finish]
 *   Optional per-item hook that runs on every makeJob result, including null.
 *   It may amend the job, return null to drop it, or throw.
 */

/**
 * Run one raw page through an adapter and return the normalised result.
 *
 * Interface contract: jobs are never null and are locally de-duplicated;
 * a page with items and no valid job throws SourceError('broken-markup');
 * errors thrown by the adapter propagate unchanged.
 *
 * @param {PageAdapter} adapter Source-specific extraction.
 * @param {any} raw Page body: HTML text or a parsed JSON value.
 * @param {any} [ctx] Extra input for the adapter, for example the page URL.
 * @returns {{ jobs: object[], hasNext: boolean } & Record<string, any>}
 */
export function parsePage(adapter, raw, ctx = {}) {
  const extraction = adapter.extract(raw, ctx);
  const jobs = [];
  for (const item of extraction.items) {
    const values = adapter.values(item, ctx);
    let job = values ? makeJob(adapter.source, values) : null;
    if (adapter.finish) job = adapter.finish(job, item);
    if (job) jobs.push(job);
  }
  if (extraction.items.length && !jobs.length) {
    throw new SourceError('broken-markup', adapter.noValid);
  }
  // Spreading last-read keeps lazy extraction fields (getters) evaluated
  // after mapping, matching the order the providers used before.
  const { items, hasNext, ...extras } = extraction;
  return { ...extras, jobs: localDedup(jobs), hasNext: Boolean(hasNext) };
}
