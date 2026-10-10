import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import plugin from '../index.mjs';
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.deepStrictEqual(Object.keys(plugin), manifest.hooks);
assert.strictEqual(plugin.provider.id, manifest.id);
assert.strictEqual(plugin.provider.detect({}), null);
assert.strictEqual(manifest.humanInTheLoop, true);
assert.deepStrictEqual(manifest.requiredEnv, []);
const jobs = await plugin.provider.fetch({ ru_market: { source: 'habr-career' } }, {
  fetchText: async () => readFileSync(new URL('../fixtures/habr-career/empty.html', import.meta.url), 'utf8'), log() {},
});
assert.deepStrictEqual(jobs, []);
console.log('smoke: provider contract OK');
