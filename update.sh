#!/bin/sh
set -eu

release_sha='__RELEASE_SHA__'
case "$release_sha" in
  *[!0-9a-f]*|'') echo 'Use update.sh from a GitHub release.' >&2; exit 1 ;;
esac
if [ "${#release_sha}" -ne 40 ]; then
  echo 'Invalid release SHA.' >&2
  exit 1
fi
if [ ! -f plugins.mjs ]; then
  echo 'Run this script from the career-ops directory.' >&2
  exit 1
fi

node plugins.mjs remove ru-market
node plugins.mjs add WindowGenerator/career-ops-plugin-ru-market --sha "$release_sha" --confirm
