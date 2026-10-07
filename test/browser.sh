#!/usr/bin/env bash
set -euo pipefail
plugin_root="$(cd "$(dirname "$0")/.." && pwd)"
core_root="${CAREER_OPS_ROOT:-$plugin_root/../career-ops}"
fixture_root="$(mktemp -d "${TMPDIR:-/tmp}/hh-browser.XXXXXX")"
trap 'rm -rf "$fixture_root"' EXIT
git -C "$core_root" archive 8c9aae34244ec2f79d1d21c05a34c5de608e7747 | tar -xf - -C "$fixture_root"
(cd "$fixture_root" && git apply "$plugin_root/companion/core-contract.patch")
ln -s "$core_root/node_modules" "$fixture_root/node_modules"
mkdir -p "$fixture_root/scripts/ru-market" "$fixture_root/tests"
cp "$plugin_root/companion/scan-hh.mjs.txt" "$fixture_root/scripts/ru-market/scan-hh.mjs"
cp "$plugin_root/companion/browser-tests.mjs.txt" "$fixture_root/tests/hh-browser.test.mjs"
export HH_DOM_FIXTURE="$plugin_root/fixtures/hh-browser/salaries.html"
export HH_CORE_TEST="$fixture_root"
(cd "$fixture_root" && node --test tests/hh-browser.test.mjs)
