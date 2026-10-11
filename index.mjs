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
 * Log a failed source by category only; the error text may contain source data.
 * @param {any} ctx
 * @param {string} source
 * @param {unknown} reason
 */
function logSourceFailure(ctx, source, reason) {
  ctx.log?.('ru-market', JSON.stringify({ source, category: categoryOf(reason), status: 'failed' }));
}

/**
 * @param {string[]} selected Source ids, in the order of `results`.
 * @param {PromiseSettledResult<unknown>[]} results
 * @returns {SourceError} Error that summarises every failed source.
 */
function allSourcesFailed(selected, results) {
  const summary = results.map((result, index) => `${selected[index]}=${categoryOf(result.reason)}`).join(', ');
  return new SourceError('sources-failed', `All sources failed: ${summary}`);
}

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
    if (result.status === 'fulfilled') {
      successes++;
      jobs.push(...result.value);
    } else {
      logSourceFailure(ctx, config.selected[index], result.reason);
    }
  });
  if (!successes) {
    throw results.length === 1 ? results[0].reason : allSourcesFailed(config.selected, results);
  }
  return deduplicate(jobs, config.order);
}

export default {
  provider: {
    id: 'ru-market',
    detect() { return null; },
    fetch: fetchAll,
  },
};
