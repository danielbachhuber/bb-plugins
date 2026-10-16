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
# devDependencies, TypeScript among them.
export npm_config_include=dev

# Every plugin and shared library is a workspace of the root, so one install
# here covers all of them, the shared libraries' own tests and typecheck too.
echo "==> npm install"
( cd "$DIR" && npm install --silent --no-audit --no-fund )

# Pushing a release tag runs .githooks/pre-push, which installs the tagged
# plugin the way the marketplace does and stops a release that fails to.
git -C "$DIR" config core.hooksPath .githooks

installed="$(bb plugin list --json 2>/dev/null || echo '[]')"

for package in "$DIR"/*/; do
  package="${package%/}"
  [ -f "$package/package.json" ] || continue

  # This repository also holds shared libraries the plugins depend on. A bb
  # plugin is the thing with a "bb" manifest block that names it; anything else,
  # such as a shared package that only lists files for Tailwind to scan, is
  # bundled in as a `file:` dependency rather than installed.
  jq -e '.bb.name | type == "string"' "$package/package.json" >/dev/null 2>&1 || continue

  id="$(basename "$package")"
  id="${id#bb-plugin-}"

  # "retired" or "ignored" in package.json's bbPlugins.status keeps a plugin
  # out of bb. sync.sh skips it the same way.
  status="$(jq -r '.bbPlugins.status // empty' "$package/package.json")"
  if [ "$status" = retired ] || [ "$status" = ignored ]; then
    echo "==> $id ($status, skipping)"
    continue
  fi

  if printf '%s' "$installed" | grep -q "\"$id\""; then
    echo "==> $id (already installed, skipping)"
    continue
  fi

  echo "==> $id"
  bb plugin install "$package" --yes
done
