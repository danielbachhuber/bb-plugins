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

installed="$(bb plugin list --json 2>/dev/null || echo '[]')"

for plugin in "$DIR"/*/; do
  plugin="${plugin%/}"
  [ -f "$plugin/package.json" ] || continue
  # This repository also holds shared libraries the plugins depend on. A bb
  # plugin is the thing with a "bb" manifest block; anything else is not
  # installable and is picked up as a `file:` dependency instead.
  jq -e '.bb | type == "object"' "$plugin/package.json" >/dev/null 2>&1 || continue

  id="$(basename "$plugin")"
  id="${id#bb-plugin-}"

  if printf '%s' "$installed" | grep -q "\"$id\""; then
    echo "==> $id (already installed, skipping)"
    continue
  fi

  echo "==> $id"
  (
    cd "$plugin"
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
