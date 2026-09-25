#!/bin/bash
#
# Install every plugin in this repository into bb on a new machine.
#
# bb loads these as `path:` sources pointing straight at the directories here,
# so there is nothing to copy: the install just tells bb where they are. What
# does have to happen first is npm, because a path install builds against
# dependencies that are already on disk.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if ! command -v bb >/dev/null 2>&1; then
  echo "bb is not on PATH. Install bb first: https://getbb.app" >&2
  exit 1
fi

# Install with the Node that .nvmrc pins; use-pinned-node.sh says why.
# shellcheck source=use-pinned-node.sh
. "$DIR/use-pinned-node.sh"
use_pinned_node || exit 1

# bb runs scripts with NODE_ENV=production, under which npm leaves out
# devDependencies, TypeScript among them. Including them here
# covers every install below, harvest:sync's too.
export npm_config_include=dev

installed="$(bb plugin list --json 2>/dev/null || echo '[]')"

for package in "$DIR"/*/; do
  package="${package%/}"
  [ -f "$package/package.json" ] || continue

  name="$(basename "$package")"

  # This repository also holds shared libraries the plugins depend on. A bb
  # plugin is the thing with a "bb" manifest block; anything else is bundled in
  # as a `file:` dependency rather than installed. Those still get an npm
  # install, so their own test and typecheck scripts work in a fresh clone.
  if ! jq -e '.bb | type == "object"' "$package/package.json" >/dev/null 2>&1; then
    echo "==> $name (shared library)"
    ( cd "$package" && npm install --silent )
    continue
  fi

  id="${name#bb-plugin-}"

  if printf '%s' "$installed" | grep -q "\"$id\""; then
    echo "==> $id (already installed, skipping)"
    continue
  fi

  echo "==> $id"
  (
    cd "$package"
    npm install --silent
    # npm resolves a `file:` dependency to a symlink, which puts a second React
    # in the tree and breaks every clock test. harvest:sync reinstates the copy
    # with --install-links. See sync.sh for the longer version.
    if jq -e '.scripts["harvest:sync"]' package.json >/dev/null 2>&1; then
      npm run --silent harvest:sync
    fi
    bb plugin install . --yes
  )
done
