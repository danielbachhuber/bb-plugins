#!/bin/bash
#
# Install, typecheck, and test one package the way CI does.
#
# Usage:
#   scripts/ci.sh <package-dir>    e.g. scripts/ci.sh bb-plugin-pr-sweep
#   scripts/ci.sh --list           print every package with a test script, as JSON
#
# Every package is an npm workspace of the root, so one `npm ci` there installs
# all of them, the shared libraries linked in place. The steps after that
# follow AGENTS.md: tsc, then tests.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"

if [ "${1:-}" = "--list" ]; then
  for pkg in "$DIR"/*/package.json; do
    jq -e '.scripts.test' "$pkg" >/dev/null 2>&1 || continue
    basename "$(dirname "$pkg")"
  done | jq -R . | jq -sc .
  exit 0
fi

[ -n "${1:-}" ] && [ -f "$DIR/$1/package.json" ] || {
  echo "usage: scripts/ci.sh <package-dir> | --list" >&2
  exit 2
}

echo "::group::npm ci"
(cd "$DIR" && npm ci --no-audit --no-fund)
echo "::endgroup::"

cd "$DIR/$1"
npx --no -- tsc --noEmit -p tsconfig.json
npm test
