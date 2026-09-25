#!/bin/bash
#
# Bring the running bb installation back in line with this checkout.
#
# `setup.sh` installs plugins on a new machine and deliberately skips anything
# already registered, so it does nothing after a `git pull`. This script covers
# the other half: a plugin whose dist/ no longer matches the source it was built
# from, a plugin that arrived in a pull and is not installed yet, and a plugin
# that a pull deleted but bb still has installed.
#
# Plugins are installed as `path:` sources pointing straight at the directories
# here, so a pull changes the source in place. What goes stale is the build,
# not a copy.
#
# Usage:
#   sync.sh            report drift and apply it
#   sync.sh --check    report drift and change nothing
#
# --check is what a post-merge hook can run. It must stay fast and offline: no
# npm, no network, no writes. It prints nothing when everything is current, so
# a pull that touches no plugin stays quiet.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

CHECK_ONLY=no
case "${1:-}" in
  --check) CHECK_ONLY=yes ;;
  "") ;;
  *) echo "usage: sync.sh [--check]" >&2; exit 2 ;;
esac

if ! command -v bb >/dev/null 2>&1; then
  # A machine without bb is not a machine with stale bb artifacts. Say so when
  # asked directly; stay silent when a git hook is asking.
  [ "$CHECK_ONLY" = yes ] && exit 0
  echo "bb is not on PATH. Install bb first: https://getbb.app" >&2
  exit 1
fi

# --- Detection ---------------------------------------------------------------
#
# A plugin is stale when anything it is built from is newer than its dist/.
# "Built from" includes its `file:` dependencies, which are bundled at build
# time rather than resolved at runtime: an edit to gh-shared has to rebuild
# every plugin that carries it, and reading the dependency out of package.json
# derives that fan-out instead of hardcoding a list that will go out of date.

stale_plugins=""   # directory \t plugin id \t what changed

# What bb has installed, enabled or not. An empty answer would make every plugin
# look new, so a failure to ask stops here rather than reinstalling them all.
if ! installed_json="$(bb plugin list --json 2>/dev/null)" \
  || ! installed_ids="$(printf '%s' "$installed_json" | jq -er '.plugins[].id')"; then
  [ "$CHECK_ONLY" = yes ] && exit 0
  echo "Could not list bb's plugins. Is bb running?" >&2
  exit 1
fi

# Source means what git tracks and what the build actually reads. Neither is
# what is simply on disk: a plugin writes runtime data inside its own directory
# (weekly-review keeps data/weeks/ there), so a plain find treats every write it
# makes as a reason to rebuild it, and prose is tracked but never compiled.
newest_source_mtime() {
  ( cd "$1" 2>/dev/null || exit 0
    git ls-files -z -- ':(exclude)*.md' 2>/dev/null \
      | xargs -0 stat -f '%m' 2>/dev/null | sort -rn | head -1 )
}

# The same, for a directory that is itself pruned as a source tree. Passing
# dist/ to newest_source_mtime prunes the very root it was handed.
newest_mtime() {
  find "$1" -type f -print0 2>/dev/null \
    | xargs -0 stat -f '%m' 2>/dev/null | sort -rn | head -1
}

# The sibling directories a plugin bundles, as `file:../<dir>` dependency specs.
file_dep_dirs() {
  jq -r '[(.dependencies // {}), (.devDependencies // {})]
         | add | values | .[]
         | select(type == "string" and startswith("file:../"))
         | sub("^file:\\.\\./"; "")' "$1/package.json" 2>/dev/null || true
}

detect_plugins() {
  local plugin id dist_mtime src_mtime reason dep dep_dir dep_mtime
  for plugin in "$DIR"/*/; do
    plugin="${plugin%/}"
    [ -f "$plugin/package.json" ] || continue
    jq -e '.bb | type == "object"' "$plugin/package.json" >/dev/null 2>&1 || continue

    id="$(basename "$plugin")"; id="${id#bb-plugin-}"

    if ! printf '%s\n' "$installed_ids" | grep -qx "$id"; then
      stale_plugins="${stale_plugins}${plugin}	${id}	not installed
"
      continue
    fi

    dist_mtime="$(newest_mtime "$plugin/dist" 2>/dev/null || true)"
    if [ -z "$dist_mtime" ]; then
      stale_plugins="${stale_plugins}${plugin}	${id}	never built
"
      continue
    fi

    reason=""
    src_mtime="$(newest_source_mtime "$plugin")"
    if [ -n "$src_mtime" ] && [ "$src_mtime" -gt "$dist_mtime" ]; then
      reason="source changed"
    fi

    while read -r dep; do
      [ -z "$dep" ] && continue
      dep_dir="$DIR/$dep"
      [ -d "$dep_dir" ] || continue
      dep_mtime="$(newest_source_mtime "$dep_dir")"
      if [ -n "$dep_mtime" ] && [ "$dep_mtime" -gt "$dist_mtime" ]; then
        if [ -z "$reason" ]; then reason="$dep changed"; else reason="$reason, $dep changed"; fi
      fi
    done < <(file_dep_dirs "$plugin")

    [ -n "$reason" ] && stale_plugins="${stale_plugins}${plugin}	${id}	${reason}
"
  done
  return 0
}

# A plugin bb loads from a directory here that no longer holds one. Removing it
# also deletes its settings and secrets, so being gone from this checkout is not
# enough: an older branch or a half-written plugin looks the same. It has to be
# gone from origin/main too, which is what a plugin deleted upstream looks like.
detect_removed() {
  local id plugin name
  git -C "$DIR" rev-parse -q --verify origin/main >/dev/null || return 0
  while IFS=$'\t' read -r id plugin; do
    [ -z "$id" ] && continue
    [ "$(dirname "$plugin")" = "$DIR" ] || continue
    [ -f "$plugin/package.json" ] && continue
    name="$(basename "$plugin")"
    git -C "$DIR" cat-file -e "origin/main:$name/package.json" 2>/dev/null && continue
    stale_plugins="${stale_plugins}${plugin}	${id}	removed from this checkout
"
  done < <(printf '%s' "$installed_json" \
    | jq -r '.plugins[] | select(.source | startswith("path:")) | "\(.id)\t\(.source | ltrimstr("path:"))"')
  return 0
}

# --- Report ------------------------------------------------------------------

detect_plugins
detect_removed

if [ -z "$stale_plugins" ]; then
  [ "$CHECK_ONLY" = yes ] || echo "bb: every plugin is current."
  exit 0
fi

count=$(printf '%s' "$stale_plugins" | grep -c . || true)
echo "bb: ${count} plugin(s) no longer match this checkout"

while IFS=$'\t' read -r plugin id reason; do
  [ -z "$plugin" ] && continue
  printf '  %-22s %s\n' "$id" "$reason"
done < <(printf '%s' "$stale_plugins")

if [ "$CHECK_ONLY" = yes ]; then
  echo "Run: ${DIR}/sync.sh"
  exit 0
fi

# --- Apply -------------------------------------------------------------------
#
# The order matters and is not interchangeable. `npm install` refreshes the
# gh-shared copy but replaces the harvest copy with a symlink, which puts a
# second React in the tree; `harvest:sync` reinstates the copy with
# --install-links. `tsc --noEmit` then catches a `file:` dependency that is
# still stale, which is the failure that otherwise reaches the panel as a
# runtime "is not a function". A plugin that does not typecheck is not built
# and not reloaded, so a broken pull cannot take a working panel down with it.

# Build with the Node that .nvmrc pins; use-pinned-node.sh says why.
# shellcheck source=use-pinned-node.sh
. "$DIR/use-pinned-node.sh"
use_pinned_node || exit 1

# bb runs scripts with NODE_ENV=production, under which npm leaves out
# devDependencies, TypeScript among them. Including them here
# covers every install below, harvest:sync's too.
export npm_config_include=dev

# A plugin bb has not seen yet is one that arrived in a pull, so it is installed
# rather than reloaded. One that bb has but is disabled stays as it is: disabling
# is how a machine opts out, and `bb plugin list` still lists it.
apply_plugin() {
  local plugin="$1" id="$2" install="$3"
  if [ "$install" = yes ]; then echo "==> $id (installing)"; else echo "==> $id"; fi
  # Every step ends in `|| exit 1` because bash ignores `set -e` inside a
  # subshell that is followed by `||`, and would carry on past a failed install
  # or typecheck to build and reload anyway.
  (
    cd "$plugin" || exit 1
    npm install --silent || exit 1
    if jq -e '.scripts["harvest:sync"]' package.json >/dev/null 2>&1; then
      npm run --silent harvest:sync || exit 1
    fi
    # --no: a missing TypeScript fails here rather than fetching the unrelated
    # `tsc` package from the registry.
    npx --no -- tsc --noEmit -p tsconfig.json || exit 1
    bb plugin build >/dev/null || exit 1
    # Staleness is "is dist older than what it was built from", and npm rewrites
    # package-lock.json as part of the install above, which can land after the
    # build it preceded. Stamping the artifacts this build just produced makes
    # dist unambiguously newer than its own inputs, so one run converges instead
    # of leaving the next check reporting work it already did.
    find dist -type f -print0 | xargs -0 touch
  ) || return 1
  if [ "$install" = yes ]; then
    bb plugin install "$plugin" --yes >/dev/null || return 1
  else
    bb plugin reload "$id" >/dev/null
  fi
  return 0
}

failed=0

while IFS=$'\t' read -r plugin id reason; do
  [ -z "$plugin" ] && continue
  if [ "$reason" = "removed from this checkout" ]; then
    echo "==> $id (removing)"
    bb plugin remove "$id" >/dev/null || { failed=1; echo "    failed; left as it was" >&2; }
    continue
  fi
  install=no
  [ "$reason" = "not installed" ] && install=yes
  apply_plugin "$plugin" "$id" "$install" || { failed=1; echo "    failed; left as it was" >&2; }
done < <(printf '%s' "$stale_plugins")

exit "$failed"
