#!/bin/sh
set -eu
plugin_root=$(pwd)
core_root=${CAREER_OPS_ROOT:-$plugin_root/../career-ops}
test_root=$(mktemp -d "${TMPDIR:-/tmp}/hh-install.XXXXXX")
trap 'rm -rf "$test_root"' EXIT HUP INT TERM
mkdir -p "$test_root/bin" "$test_root/providers"
git -C "$core_root" archive 8c9aae34244ec2f79d1d21c05a34c5de608e7747 | tar -xf - -C "$test_root"
git -C "$test_root" init -q
ln -s "$core_root/node_modules" "$test_root/node_modules"
printf '{}\n' > "$test_root/package.json"
# Model the core CLI's on-disk contract, including partial failures. No network.
cat > "$test_root/plugins.mjs" <<'JS'
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
const [command, target, ...args] = process.argv.slice(2);
const dir = 'plugins.local/ru-market';
appendFileSync('cli.log', `${command}\n`);
mkdirSync('config', { recursive: true });
if (command === 'remove') {
  assert.equal(target, 'ru-market');
  assert.ok(existsSync(dir));
  rmSync(dir, { recursive: true });
  writeFileSync('plugins.lock', 'removed\n');
  writeFileSync('config/plugins.yml', 'disabled\n');
  if (process.env.HH_FAIL === 'remove') process.exit(1);
} else {
  assert.equal(command, 'add');
  assert.equal(target, 'WindowGenerator/career-ops-plugin-ru-market');
  assert.deepEqual(args, ['--sha', '0123456789012345678901234567890123456789', '--confirm']);
  assert.equal(existsSync(dir), false, 'core refuses add over an existing plugin');
  if (process.env.HH_FAIL === 'clone') process.exit(1);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.mjs`, 'new plugin\n');
  writeFileSync('plugins.lock', 'new lock\n');
  writeFileSync('config/plugins.yml', 'enabled\n');
  if (process.env.HH_FAIL === 'enable') process.exit(1);
}
JS
cat > "$test_root/bin/curl" <<'SH'
#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output' ]; then case "$request_url" in *core-contract.patch) cp "$HH_CONTRACT_FIXTURE" "$2" ;; *core-contract-0.6.patch) cp "$HH_PREVIOUS_CONTRACT_FIXTURE" "$2" ;; *lib/untrusted.mjs) cp "$HH_LIB_FIXTURE" "$2" ;; *local-parser.patch) cp "$HH_PATCH_FIXTURE" "$2" ;; *) cp "$HH_INSTALL_FIXTURE" "$2" ;; esac; exit; fi
  case "$1" in https:*) request_url="$1" ;; esac
  shift
done
exit 1
SH
chmod +x "$test_root/bin/curl"
export HH_CONTRACT_FIXTURE="$plugin_root/companion/core-contract.patch"
export HH_PATCH_FIXTURE="$plugin_root/companion/local-parser.patch"
export HH_PREVIOUS_CONTRACT_FIXTURE="$plugin_root/companion/core-contract-0.6.patch"
export HH_LIB_FIXTURE="$plugin_root/lib/untrusted.mjs"
export HH_INSTALL_FIXTURE="$plugin_root/companion/scan-hh.mjs.txt"
export PATH="$test_root/bin:$PATH"
# Match release packaging: stamp the sole source, then copy the legacy asset.
sed 's/__RELEASE_SHA__/0123456789012345678901234567890123456789/g' "$plugin_root/install.sh" > "$test_root/install.sh"
cp "$test_root/install.sh" "$test_root/update.sh"
cd "$test_root"
rm -f plugins.lock config/plugins.yml
if HH_FAIL=enable sh install.sh > failed.log 2>&1; then echo 'failed fresh install accepted' >&2; exit 1; fi
[ ! -e plugins.local/ru-market ]
[ ! -e plugins.lock ]
[ ! -e config/plugins.yml ]
: > cli.log
sh install.sh
printf 'add\n' > expected.log
cmp cli.log expected.log
cmp scripts/ru-market/scan-hh.mjs "$HH_INSTALL_FIXTURE"
cmp scripts/ru-market/lib/untrusted.mjs "$HH_LIB_FIXTURE"
# Re-running install detects the existing plugin and replaces it.
printf 'old plugin\n' > plugins.local/ru-market/index.mjs
sh install.sh
printf 'add\nremove\nadd\n' > expected.log
cmp cli.log expected.log
printf 'new plugin\n' > expected-plugin.mjs
cmp plugins.local/ru-market/index.mjs expected-plugin.mjs
# Removal, clone and post-install enable failures must restore all CLI state.
printf 'old plugin\n' > plugins.local/ru-market/index.mjs
printf 'old lock including other plugins\n' > plugins.lock
printf 'old config including other plugins\n' > config/plugins.yml
cp plugins.local/ru-market/index.mjs previous-plugin.mjs
cp plugins.lock previous.lock
cp config/plugins.yml previous.yml
for failure in remove clone enable; do
  if HH_FAIL="$failure" sh install.sh > failed.log 2>&1; then echo "failed $failure accepted" >&2; exit 1; fi
  cmp plugins.local/ru-market/index.mjs previous-plugin.mjs
  cmp plugins.lock previous.lock
  cmp config/plugins.yml previous.yml
done
sh update.sh
git apply --reverse "$HH_CONTRACT_FIXTURE"
git apply "$HH_PATCH_FIXTURE"
sh update.sh
git apply --reverse --check "$HH_CONTRACT_FIXTURE"
# Upgrade from the 0.6.0 contract patch and a 0.6.0-style state file without the shared module.
git apply --reverse "$HH_CONTRACT_FIXTURE"
git apply "$HH_PREVIOUS_CONTRACT_FIXTURE"
mv scripts/ru-market/lib "$test_root/lib-saved"
node --input-type=module -e "import fs from 'node:fs'; const f='scripts/ru-market/scan-hh.install.json'; const s=JSON.parse(fs.readFileSync(f)); delete s.files; fs.writeFileSync(f, JSON.stringify(s)+'\n');"
sh update.sh > upgrade06.log 2>&1
grep -q 'Upgraded core contract' upgrade06.log
git apply --reverse --check "$HH_CONTRACT_FIXTURE"
cmp scripts/ru-market/lib/untrusted.mjs "$HH_LIB_FIXTURE"
# A locally edited or unmanaged shared module blocks the update, like the tool itself.
printf '\n// user edit\n' >> scripts/ru-market/lib/untrusted.mjs
if sh update.sh > refusal-lib.log 2>&1; then echo 'update overwrote local shared module changes' >&2; exit 1; fi
grep -q 'Local or unmanaged changes in scripts/ru-market/lib/untrusted.mjs' refusal-lib.log
grep -q 'user edit' scripts/ru-market/lib/untrusted.mjs
cp "$HH_LIB_FIXTURE" scripts/ru-market/lib/untrusted.mjs
node --input-type=module -e "import fs from 'node:fs'; const f='scripts/ru-market/scan-hh.install.json'; const s=JSON.parse(fs.readFileSync(f)); delete s.files; fs.writeFileSync(f, JSON.stringify(s)+'\n');"
if sh update.sh > refusal-unmanaged.log 2>&1; then echo 'update accepted unmanaged shared module' >&2; exit 1; fi
grep -q 'Local or unmanaged changes in scripts/ru-market/lib/untrusted.mjs' refusal-unmanaged.log
rm -rf scripts/ru-market/lib
sh update.sh
printf '\n// user edit\n' >> scripts/ru-market/scan-hh.mjs
if sh update.sh > refusal.log 2>&1; then echo 'update overwrote local changes' >&2; exit 1; fi
grep -q 'Local or unmanaged changes' refusal.log
grep -q 'user edit' scripts/ru-market/scan-hh.mjs
cp "$HH_INSTALL_FIXTURE" scripts/ru-market/scan-hh.mjs
# An incompatible core must leave the managed tool and prior extension intact.
git apply --reverse "$HH_CONTRACT_FIXTURE"
git apply "$HH_PATCH_FIXTURE"
printf '\n// incompatible fixture\n' > scan.mjs
cp providers/local-parser.mjs previous-parser.mjs
cp scripts/ru-market/scan-hh.mjs previous-tool.mjs
if sh update.sh > incompatible.log 2>&1; then echo 'incompatible core accepted' >&2; exit 1; fi
cmp providers/local-parser.mjs previous-parser.mjs
cmp scripts/ru-market/scan-hh.mjs previous-tool.mjs
echo 'companion install/update: auto-detection, rollback, pinned source, patch migration, shared module and local edit protection OK'
