// Plugin entry: the `ru-market` provider for career-ops.
//
// Runs every enabled source in parallel, tolerates partial failure, and
// returns one cross-source de-duplicated job list. The provider contract
// (hooks, id) is declared in manifest.json and checked by test/smoke.mjs.
import { parseConfig } from './lib/config.mjs';
import { fetchHabr } from './lib/providers/habr-career.mjs';
import { fetchGeekjob } from './lib/providers/geekjob.mjs';
import { fetchSuperjob } from './lib/providers/superjob.mjs';
import { fetchHelloWorld } from './lib/providers/helloworld.mjs';
import { fetchGetmatch } from './lib/providers/getmatch.mjs';
import { fetchTrudvsem } from './lib/providers/trudvsem.mjs';
import { deduplicate } from './lib/processors/dedup.mjs';
import { categoryOf, SourceError } from './lib/errors.mjs';

/** Source id -> fetch function `(config, ctx) => Promise<Job[]>`. */
export const adapters = {
  'habr-career': fetchHabr,
  geekjob: fetchGeekjob,
  superjob: fetchSuperjob,
  trudvsem: fetchTrudvsem,
  getmatch: fetchGetmatch,
  'helloworld-rs': fetchHelloWorld,
};

/**
 * Fetch all enabled sources.
 * @param {object} entry portals.yml entry with an `ru_market` block.
 * @param {any} ctx Guarded plugin context.
 * @returns {Promise<object[]>} Cross-source de-duplicated jobs.
 * @throws {SourceError} When every source fails; the single error itself when only one ran.
 */
async function fetchAll(entry, ctx) {
  const config = parseConfig(entry);
  // LEGACY(parser-pipeline): adapters accept a third `options` argument (health uses it for
  // `retries: 0`), but the plugin never passes one here.
  const results = await Promise.allSettled(config.selected.map(id => adapters[id](config.sources[id], ctx)));
  const jobs = [];
  let successes = 0;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      ctx.log?.(
        'ru-market',
        JSON.stringify({ source: config.selected[index], category: categoryOf(result.reason), status: 'failed' }),
      );
      return;
    }
    successes++;
    jobs.push(...result.value);
  });
  if (successes !== 0) {
    return deduplicate(jobs, config.order);
  }
  if (results.length === 1) {
    throw results[0].reason;
  }
  const summary = results.map((result, index) => `${config.selected[index]}=${categoryOf(result.reason)}`).join(', ');
  throw new SourceError('sources-failed', `All sources failed: ${summary}`);
}

export default {
  provider: {
    id: 'ru-market',
    detect() {
      return null;
    },
    fetch: fetchAll,
  },
};
