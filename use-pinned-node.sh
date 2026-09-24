# Sourced by setup.sh and sync.sh before they run npm. Not executable on its own.
#
# Switch to the Node that .nvmrc pins. npm versions disagree about what belongs
# in package-lock.json (one writes `libc` fields the other drops), so installing
# with whatever Node is first on PATH leaves every lockfile modified, and the
# next `update.sh` refuses to pull into a dirty checkout. A scheduled run gets a
# non-interactive shell that has not loaded nvm, so load it here.
#
# Expects DIR to be the repository root.
use_pinned_node() {
  local want have
  [ -f "$DIR/.nvmrc" ] || return 0
  want="$(tr -d '[:space:]v' < "$DIR/.nvmrc")"
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # nvm.sh is not written for `set -u`.
    set +u
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use
    ( cd "$DIR" && nvm which >/dev/null 2>&1 ) \
      || { set -u; echo "Node $want is not installed. Run: nvm install $want" >&2; return 1; }
    pushd "$DIR" >/dev/null && nvm use --silent >/dev/null; popd >/dev/null
    set -u
  fi
  have="$(node -v 2>/dev/null | sed 's/^v//')"
  case "$have" in
    "$want"|"$want".*) return 0 ;;
  esac
  echo "Node ${have:-none} is on PATH, but .nvmrc pins $want. Install nvm and run: nvm install $want" >&2
  return 1
}
