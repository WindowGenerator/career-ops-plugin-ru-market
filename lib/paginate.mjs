import { categoryOf } from './errors.mjs';
import { localDedup } from './dedup.mjs';

export async function paginate(source, routes, maxPages, load, ctx) {
  const jobs = [];
  const failures = [];
  let completed = 0;
  for (const route of routes) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const result = await load(route, page);
        completed++;
        jobs.push(...result.jobs);
        if (!result.hasNext || !result.jobs.length) break;
      } catch (error) {
        failures.push(error);
        // Avoid logging source responses, which may contain vacancy/PII data.
        ctx.log?.('ru-market', JSON.stringify({ source, completed_pages: completed, failed_page: page, category: categoryOf(error) }));
        break;
      }
    }
  }
  if (!completed && failures.length) throw failures[0];
  return localDedup(jobs);
}
