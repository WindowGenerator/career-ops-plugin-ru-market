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
work_tmp=$(mktemp -d "${TMPDIR:-/tmp}/ru-market-install.XXXXXX")
tool_tmp="$work_tmp/scan-hh.mjs"
lib_tmp="$work_tmp/untrusted.mjs"
companion_tmp="$work_tmp/core-contract.patch"
restore_plugin=false
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$restore_plugin" = true ]; then
    for path in plugins.local/ru-market plugins.lock config/plugins.yml; do
      if ! rm -rf "$path" || { [ -e "$work_tmp/backup/$path" ] && ! cp -pR "$work_tmp/backup/$path" "$path"; }; then
        echo "Recovery failed; backup retained at $work_tmp/backup." >&2
        exit 1
      fi
    done
    echo 'Plugin installation failed; previous plugin, lock and config restored.' >&2
  fi
  rm -rf "$work_tmp"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
curl --fail --location --silent --show-error \
  "https://raw.githubusercontent.com/WindowGenerator/career-ops-plugin-ru-market/$release_sha/companion/scan-hh.mjs.txt" \
  --output "$tool_tmp"
# Shared module imported by the companion; second managed file in scripts/ru-market/lib/.
curl --fail --location --silent --show-error \
  "https://raw.githubusercontent.com/WindowGenerator/career-ops-plugin-ru-market/$release_sha/lib/untrusted.mjs" \
  --output "$lib_tmp"
node --input-type=module - "$tool_tmp" "$release_sha" <<'JS'
import { readFileSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(resolve('package.json'));
try { require.resolve('playwright'); } catch { throw new Error('Install career-ops dependencies first: npm install'); }
const dir = 'scripts/ru-market';
for (const path of ['scripts', dir, `${dir}/lib`]) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Refusing symlink: ${path}`);
}
const target = `${dir}/scan-hh.mjs`;
const state = `${dir}/scan-hh.install.json`;
const hash = data => createHash('sha256').update(data).digest('hex');
const managed = existsSync(state) ? JSON.parse(readFileSync(state, 'utf8')) : {};
if (existsSync(target)) {
  if (lstatSync(target).isSymbolicLink() || !existsSync(state) || hash(readFileSync(target)) !== managed.sha256) {
    throw new Error(`Local or unmanaged changes in ${target}; preserve them before updating.`);
  }
}
const shared = `${dir}/lib/untrusted.mjs`;
if (existsSync(shared)) {
  if (lstatSync(shared).isSymbolicLink() || hash(readFileSync(shared)) !== managed.files?.['lib/untrusted.mjs']) {
    throw new Error(`Local or unmanaged changes in ${shared}; preserve them before updating.`);
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
  # Upgrade a previously shipped patch (0.6.0 contract or the older local-parser one), restoring it on failure.
  upgraded=false
  for previous in core-contract-0.6.patch local-parser.patch; do
    legacy_tmp="$work_tmp/$previous"
    curl --fail --location --silent --show-error \
      "https://raw.githubusercontent.com/WindowGenerator/career-ops-plugin-ru-market/$release_sha/companion/$previous" \
      --output "$legacy_tmp"
    if git apply --reverse --check "$legacy_tmp" 2>/dev/null; then
      git apply --reverse "$legacy_tmp"
      if git apply --check "$companion_tmp" 2>/dev/null; then
        git apply "$companion_tmp"
        echo 'Upgraded core contract.'
        upgraded=true
      else
        git apply "$legacy_tmp"
        echo 'Core patch incompatible; previous core extension restored. Core updates may require reinstalling the patch.' >&2
        exit 1
      fi
      break
    fi
  done
  if [ "$upgraded" != true ]; then
    echo 'Cannot apply core contract cleanly; preserve/reconcile core edits first. Core updates may require reinstalling the patch.' >&2
    exit 1
  fi
fi

node --input-type=module - "$tool_tmp" "$release_sha" "$lib_tmp" <<'JS'
import { readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
const dir = "scripts/ru-market", target = `${dir}/scan-hh.mjs`, state = `${dir}/scan-hh.install.json`;
const shared = `${dir}/lib/untrusted.mjs`;
const content = readFileSync(process.argv[2]), library = readFileSync(process.argv[4]);
const hash = data => createHash("sha256").update(data).digest("hex");
mkdirSync(`${dir}/lib`, { recursive: true });
for (const [path, data] of [[shared, library], [target, content]]) {
  writeFileSync(`${path}.tmp`, data);
  renameSync(`${path}.tmp`, path);
}
writeFileSync(state, JSON.stringify({ release: process.argv[3], sha256: hash(content), files: { 'lib/untrusted.mjs': hash(library) } }) + '\n');
console.log(`Installed ${target} and ${shared}; configure provider: local-parser separately. Core updates may require reinstalling the core patch.`);
JS

# The core CLI requires removal before add. Save its state so a failed clone,
# validation or enable step does not lose the existing installation.
mkdir -p "$work_tmp/backup/plugins.local" "$work_tmp/backup/config"
for path in plugins.local config plugins.local/ru-market plugins.lock config/plugins.yml; do
  if [ -L "$path" ]; then
    echo "Refusing symlink: $path" >&2
    exit 1
  fi
done
for path in plugins.local/ru-market plugins.lock config/plugins.yml; do
  if [ -e "$path" ]; then cp -pR "$path" "$work_tmp/backup/$path"; fi
done
restore_plugin=true
if [ -d plugins.local/ru-market ]; then
  echo 'Updating ru-market.'
  node plugins.mjs remove ru-market
else
  echo 'Installing ru-market.'
fi
node plugins.mjs add WindowGenerator/career-ops-plugin-ru-market --sha "$release_sha" --confirm
restore_plugin=false
