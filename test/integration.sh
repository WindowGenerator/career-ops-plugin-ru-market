#!/usr/bin/env bash
set -euo pipefail
plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
core_root="${CAREER_OPS_ROOT:-$plugin_root/../career-ops}"
core_root="$(cd "$core_root" && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/ru-market-integration.XXXXXX")"
trap 'rm -rf "$test_root"' EXIT
git -C "$core_root" archive HEAD | tar -x -C "$test_root"
ln -s "$core_root/node_modules" "$test_root/node_modules"
cd "$test_root"
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
  const source = { 'api.hh.ru': 'hh', 'career.habr.com': 'habr-career', 'geekjob.ru': 'geekjob' }[url.hostname];
  if (!source) throw new Error(`Unexpected integration request: ${url.hostname}`);
  const ext = source === 'hh' ? 'json' : 'html';
  return new Response(readFileSync(`plugins.local/ru-market/fixtures/${source}/normal.${ext}`, 'utf8'), {
    status: 200, headers: { 'content-type': source === 'hh' ? 'application/json' : 'text/html' },
  });
};
JS
node --import ./preload.mjs scan.mjs --dry-run > dry-run.log
cat dry-run.log
test ! -f data/pipeline.md
node --import ./preload.mjs scan.mjs > scan.log
node --input-type=module <<'JS'
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
const pipeline = readFileSync('data/pipeline.md', 'utf8');
const history = readFileSync('data/scan-history.tsv', 'utf8');
assert.match(pipeline, /https:\/\/hh.ru\/vacancy\/101/);
assert.match(pipeline, /cross-listed: Habr Career/);
assert.match(pipeline, /https:\/\/career.habr.com\/vacancies\/201/);
assert.match(pipeline, /https:\/\/geekjob.ru\/vacancy\/000000000000000000000301/);
assert.match(pipeline, /250000|250,000|250 000/);
assert.match(history, /ru-market-api/);
console.log('integration: scaffold, audit, consent, scan preview, pipeline and history OK');
JS
