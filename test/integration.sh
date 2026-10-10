#!/usr/bin/env bash
set -euo pipefail
plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$plugin_root" && sh test/companion-install.sh)
core_root="${CAREER_OPS_ROOT:-$plugin_root/../career-ops}"
core_root="$(cd "$core_root" && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/ru-market-integration.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT
git -C "$core_root" archive 8c9aae34244ec2f79d1d21c05a34c5de608e7747 | tar -x -C "$test_root"
ln -s "$core_root/node_modules" "$test_root/node_modules"
cd "$test_root"
git apply "$plugin_root/companion/core-contract.patch"
export CAREER_OPS_ROOT="$test_root"
node plugins.mjs new ru-market
(cd "$plugin_root" && tar --exclude=.git --exclude=node_modules --exclude=health.json -cf - .) | tar -xf - -C plugins.local/ru-market
node plugin-audit.mjs plugins.local/ru-market
node plugins.mjs enable ru-market --confirm
mkdir -p data
cat > portals.yml <<'YAML'
job_boards:
  - name: RU fixture integration
    provider: ru-market
    ru_market:
      source: all
      max_pages: 1
      sources:
        getmatch:
          enabled: true
        helloworld_rs:
          enabled: true
          queries: [Data Engineer]
YAML
cat > preload.mjs <<'JS'
import dns from 'node:dns/promises';
import { syncBuiltinESMExports } from 'node:module';
import { readFileSync } from 'node:fs';
// All network primitives used by the guarded context are replaced in this
// isolated subprocess. No live HTTP or personal career-ops configuration.
dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
syncBuiltinESMExports();
globalThis.fetch = async value => {
  const url = new URL(value);
  const source = { 'career.habr.com': 'habr-career', 'geekjob.ru': 'geekjob', 'getmatch.ru': 'getmatch', 'www.helloworld.rs': 'helloworld-rs' }[url.hostname];
  if (!source) throw new Error(`Unexpected integration request: ${url.hostname}`);
  const ext = source === 'getmatch' ? 'json' : 'html';
  return new Response(readFileSync(`plugins.local/ru-market/fixtures/${source}/normal.${ext}`, 'utf8'), {
    status: 200, headers: { 'content-type': source === 'getmatch' ? 'application/json' : 'text/html' },
  });
};
JS
node --import ./preload.mjs scan.mjs --dry-run > dry-run.log
cat dry-run.log
test ! -f data/pipeline.md
node --import ./preload.mjs scan.mjs --json > scan-receipt.json 2> scan.log
node --input-type=module <<'JS'
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const pipeline = readFileSync('data/pipeline.md', 'utf8');
const history = readFileSync('data/scan-history.tsv', 'utf8');
const receipt = JSON.parse(readFileSync('scan-receipt.json', 'utf8'));
assert(receipt.source_statuses.some(s => s.source === 'habr-career' && typeof s.query === 'string' && s.queryId));
assert(receipt.source_statuses.every(s => s.source !== 'hh'));
assert.match(pipeline, /https:\/\/career.habr.com\/vacancies\/201/);
assert.match(pipeline, /cross-listed: GeekJob/);
assert.match(pipeline, /https:\/\/geekjob.ru\/vacancy\/000000000000000000000301/);
assert.match(pipeline, /250000|250,000|250 000/);
assert.match(history, /ru-market-api/);
assert.match(pipeline, /https:\/\/getmatch.ru\/vacancies\/601-python-platform-engineer/);
assert.match(history, /getmatch.ru/);
assert.match(pipeline, /https:\/\/www.helloworld.rs\/posao\/Data-Engineer/);
assert(receipt.source_statuses.some(s => s.source === 'helloworld-rs' && s.query === 'Data Engineer'));
assert(!pipeline.includes('Synthetic description intentionally not copied'));
console.log('integration: scaffold, audit, consent, scan preview, pipeline and history OK');
JS

# Cross-entry dedup. core runs entries in parallel, so the winner is the first to finish, not the first in the file;
# running the HH entry first as its own scan makes HH deterministic: the later ru-market scan drops the company+role duplicate.
mkdir -p scripts/ru-market
cat > scripts/ru-market/hh-stub.mjs <<'JS'
console.log(JSON.stringify({ jobs: [{ title: 'Python Backend Engineer', url: 'https://hh.ru/vacancy/101', company: 'Тестовая компания', source: 'hh',
  injectionFlags: ['conceal'] }], sourceStatuses: [{ source: 'hh', status: 'ok', completed_pages: 1, count: 1 }] }));
JS
cat > portals.yml <<'YAML'
trust_filter:
  enabled: true
job_boards:
  - name: HH browser
    provider: local-parser
    careers_url: https://hh.ru/search/vacancy
    parser:
      command: node
      script: scripts/ru-market/hh-stub.mjs
  - name: RU fixture dedup
    provider: ru-market
    ru_market:
      source: all
      max_pages: 1
YAML
rm -f data/pipeline.md data/scan-history.tsv
node --import ./preload.mjs scan.mjs --json --company 'HH browser' > dedup-hh.json 2> dedup-hh.log
node --import ./preload.mjs scan.mjs --json --company 'RU fixture' > dedup-ru.json 2> dedup-ru.log
node --input-type=module <<'JS'
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const pipeline = readFileSync('data/pipeline.md', 'utf8');
assert.match(pipeline, /https:\/\/hh.ru\/vacancy\/101/);
assert(!pipeline.includes('career.habr.com/vacancies/201'), 'duplicate from ru-market must be dropped, HH kept');
assert.match(pipeline, /prompt-injection-suspected/);
const ru = JSON.parse(readFileSync('dedup-ru.json', 'utf8'));
assert.equal(ru.added, 0); assert(ru.duplicates >= 1);
console.log('integration: HH scanned first keeps its job over the ru-market duplicate; injection flag in trust output');
JS
CAREER_OPS_ROOT="$test_root" node "$plugin_root/test/core-patch.mjs"
