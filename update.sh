#!/bin/bash
#
# Pull main and rebuild whatever the pull made stale. Meant to run on a
# schedule, once per machine, as a bb script automation:
#
#   bb automation create --project <id> --name "Update bb-plugins" \
#     --cron "*/15 5-15 * * *" --timezone America/Los_Angeles --interpreter bash \
#     --script 'exec ~/projects/bb-plugins/update.sh'
#
# Pass the path inline rather than with --script-file: bb stores a snapshot of a
# script file, so later changes to this one would never run.
#
# It only fast-forwards. A checkout that is on another branch, has uncommitted
# changes, or has diverged from origin is someone's work in progress, and this
# leaves it alone and says why rather than stashing, resetting, or merging.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

branch="$(git symbolic-ref --short -q HEAD || true)"
if [ "$branch" != main ]; then
  echo "Skipped: the checkout is on ${branch:-a detached HEAD}, not main."
  exit 0
fi

# Untracked files are left out: a pull can proceed around them, and a new file
# someone is still writing is not a reason to stop updating.
dirty="$(git status --porcelain --untracked-files=no)"
if [ -n "$dirty" ]; then
  echo "Skipped: the checkout has uncommitted changes." >&2
  printf '%s\n' "$dirty" >&2
  exit 1
fi

git fetch --quiet origin main

before="$(git rev-parse HEAD)"
if ! git merge --ff-only --quiet origin/main 2>/dev/null; then
  echo "Skipped: main has diverged from origin/main." >&2
  exit 1
fi

if [ "$before" != "$(git rev-parse HEAD)" ]; then
  echo "Pulled:"
  git log --oneline "$before..HEAD" | sed 's/^/  /'
fi

# Run even when nothing was pulled, so a build that failed last time is retried.
exec "$DIR/sync.sh"
