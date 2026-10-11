// Pagination: walk every route and page of one source and collect its jobs.
//
// A provider supplies a `load(route, page)` function; this module runs it for
// each route and page, tags jobs with the query that found them, survives
// partial failures and logs failures without including any source text.
import { categoryOf } from '../errors.mjs';
import { localDedup } from './dedup.mjs';

// LEGACY(parser-pipeline): these sources stop ALL remaining routes on the first `access` error
// (rate limit or block), the others only stop the current route. The ids are hard-coded here
// instead of being a per-provider setting.
const STOP_ON_ACCESS_ERROR = ['getmatch', 'helloworld-rs'];

/**
 * @typedef {{ jobs: object[], hasNext: boolean, continueOnEmpty?: boolean }} PageResult
 */

/**
 * @param {unknown} error
 * @returns {number | undefined} A valid HTTP status carried by the error.
 */
function httpStatusOf(error) {
  const status = Number(error?.status ?? error?.response?.status);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

/**
 * Log a failed page. Never logs source responses, which may contain vacancy or personal data.
 * @param {any} ctx
 * @param {object} info
 */
function logFailure(ctx, { source, completed, page, routeIndex, error }) {
  const status = httpStatusOf(error);
  const diagnostic = {
    failed_page: page, query_index: routeIndex + 1,
    ...(error?.requestInfo ? { request: error.requestInfo } : {}),
    ...(status !== undefined ? { http_status: status } : {}),
  };
  const entry = { source, completed_pages: completed, ...diagnostic, category: categoryOf(error) };
  ctx.log?.('ru-market', JSON.stringify(entry));
}

/**
 * Load all pages of all routes for one source.
 * @param {string} source Provider id.
 * @param {string[]} routes Queries or categories; each is paged separately.
 * @param {number} maxPages Page limit per route.
 * @param {(route: string, page: number) => Promise<PageResult>} load
 * @param {any} ctx Plugin context; only `log` is used.
 * @returns {Promise<object[]>} Locally de-duplicated jobs, each tagged with `matchedQueries`.
 * @throws {unknown} The first failure when no page loaded at all.
 */
export async function paginate(source, routes, maxPages, load, ctx) {
  const jobs = [];
  const failures = [];
  let completed = 0;
  let stopped = false;
  for (const [routeIndex, route] of routes.entries()) {
    const queryId = `${source}-q${routeIndex + 1}`;
    for (let page = 1; page <= maxPages; page++) {
      try {
        const result = await load(route, page);
        completed++;
        for (const job of result.jobs) {
          // LEGACY(parser-pipeline): matchedQueries is written onto the job returned by the provider.
          job.matchedQueries ??= [];
          job.matchedQueries.push({ query: route, queryId });
        }
        jobs.push(...result.jobs);
        const emptyPage = !result.jobs.length && !result.continueOnEmpty;
        if (!result.hasNext || emptyPage) break;
      } catch (error) {
        failures.push(error);
        logFailure(ctx, { source, completed, page, routeIndex, error });
        if (STOP_ON_ACCESS_ERROR.includes(source) && categoryOf(error) === 'access') stopped = true;
        break;
      }
    }
    if (stopped) break;
  }
  if (!completed && failures.length) throw failures[0];
  return localDedup(jobs);
}
