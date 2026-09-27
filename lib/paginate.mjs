import { categoryOf } from './errors.mjs';
import { localDedup } from './dedup.mjs';

export async function paginate(source, routes, maxPages, load, ctx) {
  const jobs = [];
  const failures = [];
  let completed = 0;
  let stopped = false;
  let failedPage;
  for (const route of routes) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const result = await load(route, page);
        completed++;
        jobs.push(...result.jobs);
        if (!result.hasNext || !result.jobs.length) break;
      } catch (error) {
        failures.push(error);
        failedPage = page;
        // Avoid logging source responses, which may contain vacancy/PII data.
        ctx.log?.('ru-market', JSON.stringify({ source, completed_pages: completed, failed_page: page, category: categoryOf(error) }));
        if (source === 'hh' && categoryOf(error) === 'access') stopped = true;
        break;
      }
    }
    if (stopped) break;
  }
  if (!completed && failures.length) throw failures[0];
  const result = localDedup(jobs);
  Object.defineProperty(result, 'sourceStatus', { value: {
    status: failures.length ? 'partial' : 'ok', completed_pages: completed,
    ...(failures.length ? { failed_page: failedPage, category: categoryOf(failures.at(-1)) } : {}),
  } });
  return result;
}
