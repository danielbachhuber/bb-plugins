# bb-plugin-issue-sweep

A bb sidebar panel listing every open GitHub issue assigned to you, across all
repositories, in two columns: what needs you, and everything else grouped by
board status.

The sweep is deterministic: it runs `gh`, parses the result with pure functions,
and spends no model tokens. No agent is involved at any point.

## Install on a new machine

```bash
cd ~/.dotfiles/bb/plugins/bb-plugin-issue-sweep
npm install
bb plugin install . --yes
```

## Requirements

- `gh` on PATH and authenticated as you (`gh auth login`). The plugin reports a
  missing or unauthenticated `gh` as a configuration state, not an error.
- The [gh-context](../bb-plugin-gh-context) plugin, which keeps the record of
  which threads belong to which issues. Without it the panel still lists
  issues, but none offers to start a thread, since a row cannot tell whether it
  already has one; after a few sweeps without it the plugin reports that it
  needs configuring.

## What it lists

One `gh search issues --assignee=@me --state=open` call covers every repository
you can see, so there is no per-repo fan-out and no allowlist to maintain. Two
kinds of hit are dropped: pull requests, which GitHub returns because it models
them as issues, and anything without a parseable `owner/name` or timestamp.

Search caps at 100 hits. Past that the panel says the list may be incomplete
rather than quietly showing a subset.

## How the list is ordered

Every issue is in one run. The runs that need you fill the left column, and
the rest go in the right one. Each column has summary squares at its top, one
square per issue: the left column's grouped by run ("2 new comments"), the
right column's by status group ("4 backlog"), coloured as the status dots are.
Pressing a group shows only its issues in that column; pressing it again shows
them all.

| Column | Runs, in order | Rows |
| --- | --- | --- |
| Needs you | new comments, stale, working, in progress, to start | Open: title, number line, note, actions, and why the issue is there |
| Everything else | waiting on review, later, blocked | One line each, grouped by board status, opening to the same actions |

- **New comments**: comments posted since you last opened the issue or its
  thread from the panel, or started one. The first sweep to see an issue
  records its count, so nothing is new on the first sync.
- **Stale**: in one of the "Statuses counted in the sidebar", not blocked, not
  a parent, and not updated for "Stale after (days)". Flagged in red. A parent
  is never stale, because its sub-issues are the work. A board move does not
  change the issue's updated time on GitHub, so the plugin counts the moves it
  makes itself, from the picker or its own automatic moves, as activity. A
  move made on the board in GitHub is not seen, and the issue can still read
  as stale after one.
- **Working**: has a thread. Its rows have an orange left edge.
- **In progress**: in a counted status further along the "Board stages, in
  order" than the first counted one (In Progress, with the defaults), and not
  blocked. A parent counts, since its sub-issues are not done. Its squares are
  sky blue.
- **To start**: on the board in a counted status, not blocked, and without
  sub-issues.
- **Waiting on review**: in the "Board status when a closing pull request
  opens" status.
- **Later**: everything else that is not blocked, including issues with
  sub-issues that are not in progress.
- **Blocked**: blocked by an open issue, through GitHub's issue dependencies.

An issue that fits more than one run takes the first in the order above. So
an issue with a thread and new comments is in "new comments", a blocked issue
in the review status is in "waiting on review", and a blocked parent is in
"blocked". Within a run, the most
recently updated issue comes first, tie-broken by repository then number:
issues bulk-edited in one action share a timestamp to the second, and without
the tiebreak those rows would reshuffle between sweeps.

The right column groups its issues under headings: the "Board stages, in
order" from the furthest along back, then Blocked, then statuses the board has
that are not stages (a "Stalled" column, say), alphabetically, then No status,
then Not on board. Within a group, the order is the run order above.

A chevron opens or closes a row in the right column. The row whose Harvest
timer is running stays open, so the timer stays in view. A one-line row with a
stale or blocked flag shows the flag in place of its age.

## Each row

The number line shows the issue number, any stale or blocked flag, how long ago
it was updated, the comment count, sub-issue or task progress, and "N new" in
blue when there are new comments. A sub-issue shows its parent as a chip. The
repository joins the line only when more than one is in play.

An open row has a status picker on the right, under the reason the issue
needs you when it is in the left column: "New comments", "Stale", "Working",
"In progress", or "To start". Picking a status moves the issue to it on the board. The picker
reads "Add to board" for an issue off the board and "No status" for one on the
board without a status.

An open row's actions are Start thread or Open thread, Copy link, and Add note
or Edit note. The Harvest clock, when the Harvest plugin is installed, sits at
the right end of that line. Start
thread reads "No project here" and is disabled when no bb project is checked
out for the repository.

A note is a one-line next step, stored only on this machine and never sent to
GitHub. Save or Enter saves it, Cancel or Escape cancels, and saving an empty
note deletes it.

## Settings

- **Sync interval** — how often the background sweep runs. Default 5 minutes.
- **Path to the gh CLI** — override when `gh` is not on the server's PATH.
- **Only sweep repositories checked out here** — on by default. A repository is
  swept only when a bb project on this machine has it as one of its checkout's
  git remotes, upstream as readily as origin. bb's project
  list is per-installation, so this is what separates the computer a repository
  is checked out on from every other one: the work laptop's repositories stop
  filling the personal one's panel. The skipped repositories are named under
  the list, so an empty panel never reads as "nothing is assigned to you".
- **Also sweep these repositories** — comma or newline separated `owner/name`,
  for a repository worth watching without a checkout here. Ignored when the
  filter is off.
- **Project board** — the board whose status each issue is read from. Blank
  takes the first status found on any board.
- **Board stages, in order** — the order of the status groups in the right
  column, drawn furthest along first. Default
  `Backlog,Ready,In Progress,In Review`.
- **Statuses counted in the sidebar** — the statuses the sidebar count and "to
  start" are made of. Default `In Progress,Ready`.
- **Stale after (days)** — how long a counted issue can go without an update
  before it is flagged stale. Default 7; anything but a positive whole number
  is read as 7.
- **Board status when a closing pull request opens** — the board move made when
  a pull request that closes the issue opens, and the status the list reads as
  waiting on review. Default `In Review`.

## When a sweep fails

The last good rows stay in the store and stay on screen, with the error in a
banner above them. A stale list beats an empty one, and the background service
keeps running, so the panel heals on its own once `gh` works again.

## Development

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
bb plugin dev     # rebuild and reload on save
```

**All test fixtures are synthetic.** This repository is public. Never paste real
issue titles, repository names, or URLs into a test.

## Threads

A thread started from a row is linked to its issue in gh-context, and the row
then opens that thread rather than starting another.

A thread started from the composer whose first prompt links exactly one issue
is adopted on the next successful sweep when that issue is in the list: linked
to the row, moved on the board as a thread started here would be, and given
this plugin's title unless another thread already has it. gh-context reads the
prompt; this plugin decides which of those threads are its own. A handoff
thread that only names the issue on its first line (`issue #N`) is left alone:
gh-context's banner shows the issue, but the thread keeps the title it was
handed off with.
