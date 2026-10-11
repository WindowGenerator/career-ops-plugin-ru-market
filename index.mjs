import { parseConfig } from './lib/config.mjs';
import { fetchHabr } from './lib/habr-career.mjs';
import { fetchGeekjob } from './lib/geekjob.mjs';
import { fetchSuperjob } from './lib/superjob.mjs';
import { fetchHelloWorld } from './lib/helloworld.mjs';
import { fetchGetmatch } from './lib/getmatch.mjs';
import { fetchTrudvsem } from './lib/trudvsem.mjs';
import { deduplicate } from './lib/dedup.mjs';
import { categoryOf, SourceError } from './lib/errors.mjs';

export const adapters = { 'habr-career': fetchHabr, geekjob: fetchGeekjob, superjob: fetchSuperjob, trudvsem: fetchTrudvsem, getmatch: fetchGetmatch, 'helloworld-rs': fetchHelloWorld };
export default {
  provider: {
    id: 'ru-market',
    detect() { return null; },
    fetch: async (entry, ctx) => {
      const config = parseConfig(entry);
      const results = await Promise.allSettled(config.selected.map(id => adapters[id](config.sources[id], ctx)));
      const jobs = [];
      let successes = 0;
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successes++;
          jobs.push(...result.value);
        } else {
          ctx.log?.('ru-market', JSON.stringify({ source: config.selected[index], category: categoryOf(result.reason), status: 'failed' }));
        }
      });
      if (!successes) {
        throw results.length === 1 ? results[0].reason
          : new SourceError('sources-failed', `All sources failed: ${results.map((r, i) => `${config.selected[i]}=${categoryOf(r.reason)}`).join(', ')}`);
      }
      return deduplicate(jobs, config.order);
    },
  },
};
