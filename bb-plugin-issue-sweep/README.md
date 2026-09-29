# bb-plugin-issue-sweep

A bb sidebar panel listing every open GitHub issue assigned to you, across all
repositories, in one list ordered by what needs you: Now, then Next, then
Later.

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

Every issue is in one run, and every run is in one tier. The summary squares
above the list show one square per issue, grouped by run and counted ("3 new
comments"). Pressing a run shows only its issues; pressing it again shows them
all.

| Tier | Runs, in order | Rows |
| --- | --- | --- |
| Now | new comments, stale, working | Open: title, number line, note, and actions |
| Next | to start | Closed to the title and number line |
| Later | waiting on review, later, blocked | One dimmed line each, folded after five |

- **New comments**: comments posted since you last opened the issue or its
  thread from the panel, or started one. The first sweep to see an issue
  records its count, so nothing is new on the first sync.
- **Stale**: in one of the "Statuses counted in the sidebar", not blocked, not
  a parent, and not updated for "Stale after (days)". Flagged in red. A parent
  is never stale, because its sub-issues are the work. A board move does not
  change the issue's updated time on GitHub, so the plugin counts the moves it
  makes itself, from the track, the picker, or its own automatic moves, as
  activity. A move made on the board in GitHub is not seen, and the issue can
  still read as stale after one.
- **Working**: has a thread.
- **To start**: on the board in a counted status, not blocked, and without
  sub-issues.
- **Waiting on review**: in the "Board status when a closing pull request
  opens" status.
- **Later**: statuses that are board stages, in stage order; then statuses the
  board has that are not stages (a "Stalled" column, say), alphabetically;
  then issues with no board status; then issues with sub-issues.
- **Blocked**: blocked by an open issue, through GitHub's issue dependencies.

An issue that fits more than one run takes the first in the order above. So
an issue with a thread and new comments is in "new comments", a blocked issue
in the review status is in "waiting on review", and a blocked parent is in
"blocked". Within a run, the most
recently updated issue comes first, tie-broken by repository then number:
issues bulk-edited in one action share a timestamp to the second, and without
the tiebreak those rows would reshuffle between sweeps.

A chevron opens or closes any row, and "Expand all" opens every row.

## Each row

The number line shows the issue number, any stale or blocked flag, how long ago
it was updated, the comment count, sub-issue or task progress, and "N new" in
blue when there are new comments. A sub-issue shows its parent as a chip. The
repository joins the line only when more than one is in play.

The track on the right has one column per "Board stages, in order". Clicking a
stage moves the issue to that status on the board. An issue with no status gets
an "Add to board" picker in place of the track, and one whose status is not a
stage shows the status name.

An open row's actions are Start thread or Open thread, Add note or Edit note,
Copy link, and the Harvest clock when the Harvest plugin is installed. Start
thread reads "No project here" and is disabled when no bb project is checked
out for the repository.

A note is a one-line next step, stored only on this machine and never sent to
GitHub. Enter saves it, Escape cancels, and saving an empty note deletes it.

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
- **Board stages, in order** — the track's columns. Default
  `Backlog,Ready,In Progress,In Review`.
- **Statuses counted in the sidebar** — the statuses the sidebar count and Next
  are made of. Default `In Progress,Ready`.
- **Stale after (days)** — how long a counted issue can go without an update
  before it moves up into Now. Default 7; anything but a positive whole number
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
