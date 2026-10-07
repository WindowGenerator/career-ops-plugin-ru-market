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
printf '// fixture plugin CLI\n' > "$test_root/plugins.mjs"
cat > "$test_root/bin/curl" <<'SH'
#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output' ]; then case "$request_url" in *core-contract.patch) cp "$HH_CONTRACT_FIXTURE" "$2" ;; *local-parser.patch) cp "$HH_PATCH_FIXTURE" "$2" ;; *) cp "$HH_INSTALL_FIXTURE" "$2" ;; esac; exit; fi
  case "$1" in https:*) request_url="$1" ;; esac
  shift
done
exit 1
SH
chmod +x "$test_root/bin/curl"
export HH_CONTRACT_FIXTURE="$plugin_root/companion/core-contract.patch"
export HH_PATCH_FIXTURE="$plugin_root/companion/local-parser.patch"
export HH_INSTALL_FIXTURE="$plugin_root/companion/scan-hh.mjs.txt"
export PATH="$test_root/bin:$PATH"
for script in install.sh update.sh; do
  sed 's/__RELEASE_SHA__/0123456789012345678901234567890123456789/g' "$plugin_root/$script" > "$test_root/$script"
done
cd "$test_root"
sh install.sh
cmp scripts/ru-market/scan-hh.mjs "$HH_INSTALL_FIXTURE"
sh update.sh
git apply --reverse "$HH_CONTRACT_FIXTURE"
git apply "$HH_PATCH_FIXTURE"
sh update.sh
git apply --reverse --check "$HH_CONTRACT_FIXTURE"
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
echo 'companion install/update: pinned source, core Playwright, local edit protection OK'
