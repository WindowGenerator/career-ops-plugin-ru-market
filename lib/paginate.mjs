import { categoryOf } from './errors.mjs';
import { localDedup } from './dedup.mjs';

export async function paginate(source, routes, maxPages, load, ctx) {
  const jobs = [];
  const failures = [];
  let completed = 0;
  const queryStatuses = [];
  let stopped = false;
  let failureDiagnostic;
  for (const [routeIndex, route] of routes.entries()) {
    const queryStatus = { source, transport: ['hh', 'getmatch', 'superjob', 'trudvsem'].includes(source) ? 'api' : 'html',
      query: route, queryId: `${source}-q${routeIndex + 1}`, completed_pages: 0, count: 0, status: 'ok' };
    queryStatuses.push(queryStatus);
    const queryUrls = new Set();
    for (let page = 1; page <= maxPages; page++) {
      try {
        const result = await load(route, page);
        completed++;
        queryStatus.completed_pages++;
        for (const job of result.jobs) {
          queryUrls.add(job.url);
          job.matchedQueries ??= [];
          job.matchedQueries.push({ query: route, queryId: queryStatus.queryId });
        }
        queryStatus.count = queryUrls.size;
        queryStatus.stop_reason = result.hasNext ? 'page-limit' : result.jobs.length ? 'exhausted' : 'empty';
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
        Object.assign(queryStatus, failureDiagnostic, { category: categoryOf(error), status: queryStatus.completed_pages ? 'partial' : 'failed', message: `${source}: ${categoryOf(error)}` });
        // Avoid logging source responses, which may contain vacancy/PII data.
        ctx.log?.('ru-market', JSON.stringify({ source, completed_pages: completed, ...failureDiagnostic, category: categoryOf(error) }));
        if (['hh', 'getmatch', 'helloworld-rs'].includes(source) && categoryOf(error) === 'access') stopped = true;
        break;
      }
    }
    if (stopped) {
      for (let index = routeIndex + 1; index < routes.length; index++) queryStatuses.push({ source, transport: queryStatus.transport,
        query: routes[index], queryId: `${source}-q${index + 1}`, completed_pages: 0, count: 0, status: 'skipped', category: 'access', message: 'Skipped after access block' });
      break;
    }
  }
  if (!completed && failures.length) { failures[0].queryStatuses = queryStatuses; throw failures[0]; }
  const result = localDedup(jobs);
  Object.defineProperty(result, 'sourceStatus', { value: {
    status: failures.length ? 'partial' : 'ok', completed_pages: completed,
    ...(failures.length ? { ...failureDiagnostic, category: categoryOf(failures.at(-1)) } : {}),
  } });
  Object.defineProperty(result, 'queryStatuses', { value: queryStatuses });
  return result;
}
