// Per-host request queues: politeness towards public job boards.
//
// Every request goes through the queue of its host, so concurrent providers
// never hit one site faster than the spacing allows.
import { SOURCE_IDS, SOURCE_REGISTRY } from '../sources.mjs';

// LEGACY(parser-pipeline): `sleep` is redefined in retry.mjs too; left duplicated.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_SPACING_MS = 750;

/**
 * Create a queue that starts tasks at most `concurrency` at a time, at least
 * `spacingMs` apart.
 * @param {object} [options]
 * @param {number} [options.concurrency] Tasks running at once.
 * @param {number} [options.spacingMs] Minimum gap between task starts.
 * @param {() => number} [options.now] Clock, injected for tests.
 * @param {(ms: number) => Promise<void>} [options.wait] Sleep, injected for tests.
 * @returns {<T>(run: () => T | Promise<T>) => Promise<T>} Enqueue function.
 */
export function createQueue({
  concurrency = 1,
  spacingMs = DEFAULT_SPACING_MS,
  now = Date.now,
  wait = sleep,
} = {}) {
  let active = 0;
  let nextStart = 0;
  let launching = false;
  const pending = [];

  async function pump() {
    if (launching) return;
    launching = true;
    try {
      while (pending.length && active < concurrency) {
        await wait(Math.max(0, nextStart - now()));
        const { run, resolve, reject } = pending.shift();
        active++;
        nextStart = now() + spacingMs;
        Promise.resolve()
          .then(run)
          .then(resolve, reject)
          .finally(() => {
            active--;
            void pump();
          });
      }
    } finally {
      launching = false;
      if (pending.length && active < concurrency) void pump();
    }
  }

  return run =>
    new Promise((resolve, reject) => {
      pending.push({ run, resolve, reject });
      void pump();
    });
}

// Module singleton: shared by every provider invocation in this process.
// One queue per listing host, spaced as the source registry says.
const queues = new Map(
  SOURCE_IDS.map(id => [
    SOURCE_REGISTRY[id].listingHost,
    createQueue({ spacingMs: SOURCE_REGISTRY[id].spacingMs }),
  ]),
);

/**
 * Run a request through the queue of its host.
 * @template T
 * @param {string} host Hostname from the request URL.
 * @param {() => T | Promise<T>} run The request.
 * @returns {Promise<T>}
 * @throws {Error} For hosts without a queue.
 */
export function enqueue(host, run) {
  const queue = queues.get(host);
  if (!queue) throw new Error(`Unsupported request host: ${host}`);
  return queue(run);
}
