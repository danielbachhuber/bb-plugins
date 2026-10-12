#!/bin/bash
#
# Install, typecheck, and test one package the way CI does.
#
# Usage:
#   scripts/ci.sh <package-dir>    e.g. scripts/ci.sh bb-plugin-pr-sweep
#   scripts/ci.sh --list           print every package with a test script, as JSON
#
# A package's `file:../<dir>` dependencies are linked, not copied, so their own
# imports resolve from their own node_modules. Those have to be installed first,
# and theirs before them, which is why this walks the `file:` graph rather than
# installing only the package under test. The order of the steps after that
# follows AGENTS.md: install, harvest:sync where it exists, tsc, then tests.

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

file_dep_dirs() {
  jq -r '[(.dependencies // {}), (.devDependencies // {})]
         | add | values | .[]
         | select(type == "string" and startswith("file:../"))
         | sub("^file:\\.\\./"; "")' "$DIR/$1/package.json"
}

installed=" "
install_with_deps() {
  local dep
  case "$installed" in *" $1 "*) return 0 ;; esac
  installed="$installed$1 "
  for dep in $(file_dep_dirs "$1"); do
    install_with_deps "$dep"
  done
  # npm install, not npm ci: harvest:sync records `file:` dependencies in the
  # lockfile as packed copies, which npm ci rejects as out of sync.
  echo "::group::npm install ($1)"
  (cd "$DIR/$1" && npm install --no-audit --no-fund)
  echo "::endgroup::"
}

install_with_deps "$1"

cd "$DIR/$1"
if jq -e '.scripts["harvest:sync"]' package.json >/dev/null; then
  echo "::group::harvest:sync"
  npm run --silent harvest:sync
  echo "::endgroup::"
fi
npx --no -- tsc --noEmit -p tsconfig.json
npm test
