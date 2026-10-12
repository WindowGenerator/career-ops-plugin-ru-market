import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import plugin, { adapters } from '../index.mjs';
import {
  DEFAULT_SOURCE_IDS,
  LISTING_HOSTS,
  SOURCE_IDS,
  SOURCE_REGISTRY,
} from '../lib/sources.mjs';
const manifest = JSON.parse(
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
);
assert.deepStrictEqual(Object.keys(plugin), manifest.hooks);
assert.strictEqual(plugin.provider.id, manifest.id);
assert.strictEqual(plugin.provider.detect({}), null);
assert.strictEqual(manifest.humanInTheLoop, true);
assert.deepStrictEqual(manifest.requiredEnv, []);
const jobs = await plugin.provider.fetch(
  { ru_market: { source: 'habr-career' } },
  {
    fetchText: async () =>
      readFileSync(
        new URL('../fixtures/habr-career/empty.html', import.meta.url),
        'utf8',
      ),
    log() {},
  },
);
assert.deepStrictEqual(jobs, []);

// Registry pins: persisted strings are literals on purpose, not derived.
assert.deepStrictEqual(SOURCE_IDS, [
  'habr-career',
  'geekjob',
  'superjob',
  'trudvsem',
  'getmatch',
  'helloworld-rs',
]);
assert.deepStrictEqual(DEFAULT_SOURCE_IDS, ['habr-career', 'geekjob']);
assert.deepStrictEqual(
  Object.fromEntries(SOURCE_IDS.map(id => [id, SOURCE_REGISTRY[id].configKey])),
  {
    'habr-career': 'habr_career',
    geekjob: 'geekjob',
    superjob: 'superjob',
    trudvsem: 'trudvsem',
    getmatch: 'getmatch',
    'helloworld-rs': 'helloworld_rs',
  },
);
assert.deepStrictEqual(LISTING_HOSTS, [
  'career.habr.com',
  'geekjob.ru',
  'api.superjob.ru',
  'opendata.trudvsem.ru',
  'getmatch.ru',
  'www.helloworld.rs',
]);
for (const id of SOURCE_IDS) {
  assert.strictEqual(SOURCE_REGISTRY[id].id, id);
  assert(Object.isFrozen(SOURCE_REGISTRY[id]), `${id} entry is frozen`);
}
assert(Object.isFrozen(SOURCE_REGISTRY));
assert(Object.isFrozen(SOURCE_IDS));
assert(Object.isFrozen(DEFAULT_SOURCE_IDS));
assert(Object.isFrozen(LISTING_HOSTS));
// manifest.json is a literal the engine reads, so it cannot import the registry.
assert.deepStrictEqual(
  [...manifest.allowedHosts].sort(),
  [...LISTING_HOSTS].sort(),
);
assert.deepStrictEqual(Object.keys(adapters), SOURCE_IDS);
console.log('smoke: provider contract OK');
