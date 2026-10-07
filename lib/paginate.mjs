import { categoryOf } from './errors.mjs';
import { localDedup } from './dedup.mjs';

export async function paginate(source, routes, maxPages, load, ctx) {
  const jobs = [];
  const failures = [];
  let completed = 0;
  let stopped = false;
  let failureDiagnostic;
  for (const [routeIndex, route] of routes.entries()) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const result = await load(route, page);
        completed++;
        jobs.push(...result.jobs);
        if (!result.hasNext || (!result.jobs.length && !result.continueOnEmpty)) break;
      } catch (error) {
        failures.push(error);
        const status = Number(error?.status ?? error?.response?.status);
        failureDiagnostic = {
          failed_page: page, query_index: routeIndex + 1,
          ...(error?.requestInfo ? { request: error.requestInfo } : {}),
          ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { http_status: status } : {}),
        };
        error.sourceDiagnostic = failureDiagnostic;
        // Avoid logging source responses, which may contain vacancy/PII data.
        ctx.log?.('ru-market', JSON.stringify({ source, completed_pages: completed, ...failureDiagnostic, category: categoryOf(error) }));
        if (['hh', 'getmatch'].includes(source) && categoryOf(error) === 'access') stopped = true;
        break;
      }
    }
    if (stopped) break;
  }
  if (!completed && failures.length) throw failures[0];
  const result = localDedup(jobs);
  Object.defineProperty(result, 'sourceStatus', { value: {
    status: failures.length ? 'partial' : 'ok', completed_pages: completed,
    ...(failures.length ? { ...failureDiagnostic, category: categoryOf(failures.at(-1)) } : {}),
  } });
  return result;
}
