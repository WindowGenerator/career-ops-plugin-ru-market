import { parseConfig } from './lib/config.mjs';
import { fetchHh } from './lib/hh.mjs';
import { fetchHabr } from './lib/habr-career.mjs';
import { fetchGeekjob } from './lib/geekjob.mjs';
import { fetchSuperjob } from './lib/superjob.mjs';
import { fetchGetmatch } from './lib/getmatch.mjs';
import { fetchTrudvsem } from './lib/trudvsem.mjs';
import { deduplicate } from './lib/dedup.mjs';
import { categoryOf, SourceError } from './lib/errors.mjs';

export const adapters = { hh: fetchHh, 'habr-career': fetchHabr, geekjob: fetchGeekjob, superjob: fetchSuperjob, trudvsem: fetchTrudvsem, getmatch: fetchGetmatch };
export default {
  provider: {
    id: 'ru-market',
    detect() { return null; },
    fetch: async (entry, ctx) => {
      const config = parseConfig(entry);
      const results = await Promise.allSettled(config.selected.map(id => adapters[id](config.sources[id], ctx)));
      const jobs = [];
      const sourceStatuses = [];
      let successes = 0;
      results.forEach((result, index) => {
        const source = config.selected[index];
        if (result.status === 'fulfilled') {
          successes++;
          jobs.push(...result.value);
          sourceStatuses.push({ source, ...result.value.sourceStatus, count: result.value.length });
        } else {
          const category = categoryOf(result.reason);
          sourceStatuses.push({ source, status: 'failed', category, completed_pages: 0, count: 0,
            ...(result.reason?.sourceDiagnostic ?? {}) });
          ctx.log?.('ru-market', JSON.stringify({ source, category, status: 'failed' }));
        }
      });
      if (!successes) {
        const error = results.length === 1 ? results[0].reason
          : new SourceError('sources-failed', `All sources failed: ${results.map((r, i) => `${config.selected[i]}=${categoryOf(r.reason)}`).join(', ')}`);
        error.sourceStatuses = sourceStatuses;
        throw error;
      }
      const merged = deduplicate(jobs, config.order);
      Object.defineProperty(merged, 'sourceStatuses', { value: sourceStatuses });
      return merged;
    },
  },
};
