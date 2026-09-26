const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createQueue({ concurrency = 1, spacingMs = 750, now = Date.now, wait = sleep } = {}) {
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
        Promise.resolve().then(run).then(resolve, reject).finally(() => {
          active--;
          void pump();
        });
      }
    } finally {
      launching = false;
      if (pending.length && active < concurrency) void pump();
    }
  }
  return run => new Promise((resolve, reject) => {
    pending.push({ run, resolve, reject });
    void pump();
  });
}

// Module singleton: shared by every provider invocation in this process.
const queues = new Map([
  ['api.hh.ru', createQueue({ concurrency: 2, spacingMs: 0 })],
  ['career.habr.com', createQueue()],
  ['geekjob.ru', createQueue()],
]);

export function enqueue(host, run) {
  const queue = queues.get(host);
  if (!queue) throw new Error(`Unsupported request host: ${host}`);
  return queue(run);
}
