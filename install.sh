#!/bin/sh
set -eu

release_sha='__RELEASE_SHA__'
case "$release_sha" in
  *[!0-9a-f]*|'') echo 'Use install.sh from a GitHub release.' >&2; exit 1 ;;
esac
if [ "${#release_sha}" -ne 40 ]; then
  echo 'Invalid release SHA.' >&2
  exit 1
fi
if [ ! -f plugins.mjs ]; then
  echo 'Run this script from the career-ops directory.' >&2
  exit 1
fi

# Standalone companion: outside the plugin sandbox, uses career-ops Playwright.
tool_tmp=$(mktemp "${TMPDIR:-/tmp}/ru-market-tool.XXXXXX")
companion_tmp=$(mktemp "${TMPDIR:-/tmp}/ru-market-hh.XXXXXX")
trap 'rm -f "$companion_tmp" "$tool_tmp"' EXIT HUP INT TERM
curl --fail --location --silent --show-error \
  "https://raw.githubusercontent.com/WindowGenerator/career-ops-plugin-ru-market/$release_sha/companion/scan-hh.mjs.txt" \
  --output "$tool_tmp"
node --input-type=module - "$tool_tmp" "$release_sha" <<'JS'
import { readFileSync, existsSync, mkdirSync, writeFileSync, renameSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('package.json'));
try { require.resolve('playwright'); } catch { throw new Error('Install career-ops dependencies first: npm install'); }
const dir = 'scripts/ru-market';
for (const path of ['scripts', dir]) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
}
const target = `${dir}/scan-hh.mjs`;
const state = `${dir}/scan-hh.install.json`;
const hash = data => createHash('sha256').update(data).digest('hex');
const content = readFileSync(process.argv[2]);
if (existsSync(target)) {
  if (lstatSync(target).isSymbolicLink() || !existsSync(state)
    || hash(readFileSync(target)) !== JSON.parse(readFileSync(state, 'utf8')).sha256) {
    throw new Error(`Local or unmanaged changes in ${target}; preserve them before updating.`);
  }
}

JS

# Full contract patch includes source statuses, explicit compensation and formatter.
curl --fail --location --silent --show-error \
  "https://raw.githubusercontent.com/WindowGenerator/career-ops-plugin-ru-market/$release_sha/companion/core-contract.patch" \
  --output "$companion_tmp"
if git apply --reverse --check "$companion_tmp" 2>/dev/null; then
  echo 'Core compensation contract already applied.'
elif git apply --check "$companion_tmp" 2>/dev/null; then
  git apply "$companion_tmp"
  echo 'Applied core compensation contract.'
else
  # Upgrade the previously shipped local-parser patch, restoring it on failure.
  legacy_tmp=$(mktemp "${TMPDIR:-/tmp}/ru-market-legacy.XXXXXX")
  trap 'rm -f "$companion_tmp" "$tool_tmp" "$legacy_tmp"' EXIT HUP INT TERM
  curl --fail --location --silent --show-error \
    "https://raw.githubusercontent.com/WindowGenerator/career-ops-plugin-ru-market/$release_sha/companion/local-parser.patch" \
    --output "$legacy_tmp"
  if git apply --reverse --check "$legacy_tmp" 2>/dev/null; then
    git apply --reverse "$legacy_tmp"
    if git apply --check "$companion_tmp" 2>/dev/null; then
      git apply "$companion_tmp"
      echo 'Upgraded core compensation contract.'
    else
      git apply "$legacy_tmp"
      echo 'Core patch incompatible; previous local-parser extension restored.' >&2
      exit 1
    fi
  else
    echo 'Cannot apply core contract cleanly; preserve/reconcile core edits first.' >&2
    exit 1
  fi
fi

node --input-type=module - "$tool_tmp" "$release_sha" <<'JS'
import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = "scripts/ru-market", target = `${dir}/scan-hh.mjs`, state = `${dir}/scan-hh.install.json`;
const content = readFileSync(process.argv[2]);
const hash = data => createHash("sha256").update(data).digest("hex");
mkdirSync(dir, { recursive: true });
writeFileSync(`${target}.tmp`, content);
renameSync(`${target}.tmp`, target);
writeFileSync(state, JSON.stringify({ release: process.argv[3], sha256: hash(content) }) + '\n');
console.log(`Installed ${target}; configure provider: local-parser separately.`);
JS

node plugins.mjs add WindowGenerator/career-ops-plugin-ru-market --sha "$release_sha" --confirm
