# bb-plugin-pr-sweep

A bb sidebar panel listing every open pull request you authored, across all
repositories, in one list ordered by what needs you: Now, then Next, then
Later.

The sweep is deterministic: it runs `gh`, classifies the result with pure
functions, and spends no model tokens. An agent is only involved when you click
"Start thread" on a row.

## Install on a new machine

```bash
cd ~/.dotfiles/bb/plugins/bb-plugin-pr-sweep
npm install
bb plugin install . --yes
```

## Requirements

- The [gh-context](../bb-plugin-gh-context) plugin, which keeps the record of
  which threads belong to which pull requests. Without it the panel still lists
  pull requests, but none offers to start a thread, since a row cannot tell
  whether it already has one; after a few sweeps without it the plugin reports
  that it needs configuring.
- `gh` on PATH and authenticated as you (`gh auth login`). The plugin reports a
  missing or unauthenticated `gh` as a configuration state, not an error.
- A bb project is needed only for "Start thread", which matches a PR's
  repository against every git remote in the project's checkout, so a fork's
  upstream counts as well as its origin. PRs in repositories with no matching
  project are still listed; their action reads "No project here" and is
  disabled.

## How the list is ordered

Every pull request is in one run, and every run is in one tier. The summary
squares above the list show one square per pull request, grouped by run and
counted ("2 need you"). Pressing a run shows only its pull requests; pressing
it again shows them all.

| Tier | Runs, in order |
| --- | --- |
| Now | needs you, ready to merge, working |
| Next | drafts |
| Later | waiting, folded after five |

- **Needs you**: a flag or open comments that are yours to act on.
- **Ready to merge**: approved, green, and nobody else asked to review.
- **Working**: has a thread, whatever its flags say. Its squares are green,
  and so is its rows' left edge.
- **Drafts**: not offered for review yet, flagged or not.
- **Waiting**: only a CI run in flight, approved with another reviewer still
  asked, or awaiting review. In that order within the run.

Within a run, the worst flag comes first, tie-broken by repository then
number, so rows do not reshuffle between sweeps.

Every row is open, with its title line, banner, icons, note, and actions.
There is no chevron to close one.

## Each row

The title line starts with the pull request's icon, green when it is open and
grey for a draft, then the title and number, "N new" in blue when comments
were posted since you last opened the pull request or its thread from the
panel, or started one, and how long ago it was updated on the right. The first
sweep to see a pull request records its comment count, so nothing is new on
the first sync.

A pull request in a stack, built on another open pull request's branch or
with one built on its own, has a chip after its number: "3 of 5 · on #612",
with the number linking to the pull request below it, or "1 of 5 · base" at
the bottom. Two pull requests on one base share an index, and the count is
every open pull request in the stack, whoever opened it. Rows keep their place
in the list, so a stack's layers can sit apart. The stacks come from one more
GraphQL call per sweep, reading the open pull requests in each swept
repository; a failure there drops the chips, not the sweep.

Under the title, a banner says where the pull request stands.

- **Red, for what stops it**, the first that applies: "Merge conflict with
  main" (naming its base branch), "2 of 9 checks failing", "Approved, but
  GitHub won't merge it · a branch rule isn't met" (approved and passing, yet
  a rule the listing cannot name still blocks it; when the approval came with
  feedback, the feedback leads instead), "1 of 9 checks cancelled",
  "No checks ran on the latest push", or "No reviewer requested".
- **Reviewers' feedback** follows a blocker in lighter text after a dot, and
  stands alone in red when nothing else is wrong. Who requested changes
  leads ("hubber requested changes"). Otherwise the banner names everyone
  waiting on you, most unanswered threads first: "octocat left review
  comments" (a review that neither approved nor requested changes), "hubber
  approved with notes", "Review notes from hubber", or "Comments from hubber
  and octocat" when it is a mix, including inline comments from someone who
  approved. The unresolved comment threads follow a reviewer's name, split
  into those still unanswered and those you replied to last ("6 unanswered
  comments, 1 replied"), since a reply often answers a thread nobody marks
  resolved. Unanswered threads are the banner on their own when no review
  explains them, and only they put a pull request in needs you.
- **Green** "Ready to merge", followed by who approved, or by who has not
  reviewed yet when someone else was asked.
- **Blue** for a wait worth knowing about: "Waiting on hubber to re-review",
  or "GitHub is still checking for conflicts".
- **None** for a draft, a first review not yet given, or checks still
  running, which the icons already show.

Under the banner, a line of icons: each reviewer's avatar with a badge for
where their review stands (requested, changes requested, approved, or
commented), or "no reviewer"; the checks as a green check with how many passed
out of those that ran, a clock while some are running, or a red cross with how
many failed or were cancelled, skipped checks left out and nothing shown when
the pull request has no checks; and the lines
added and removed. The repository joins the line only when more than one is in
play. A pull request awaiting review that has not been updated for "Stale
after (days)" shows "Waiting N days" in red there too. A one-line Later row
shows this line in place of its age.

A row has no stage track on the right, unlike Issue Sweep's: the banner and
the icons say where a pull request stands.

An open row's actions are Start thread or Open thread, Archive thread on a row
whose thread has no flags left, a menu of earlier threads when there are any,
Copy link, and Add note or Edit note. The Harvest clock, when the Harvest
plugin is installed, sits at the right end of that line. Start thread's tooltip names the work, such as "Resolve
conflict". A row only waiting for a run to finish offers no Start thread.

A note is a one-line next step, stored only on this machine and never sent to
GitHub. Save or Enter saves it, Cancel or Escape cancels, and saving an empty
note deletes it.

## Threads

A thread started from a row is linked to its pull request in gh-context, and
the row then opens that thread rather than starting another. gh-context's
banner above the composer shows the pull request on every thread, so this
plugin adds nothing to the thread itself.

A row's Start thread opens bb's composer in a dialog, so you can read and edit the
prompt first. The thread runs in a worktree on the pull request's own branch,
beside the checkout as `<checkout>-pr-<number>`, so its commits land on the
pull request and bb shows the pull request's checks and merge state on the
thread. bb's own worktrees always start a new branch, so the dialog hides the
composer's project, environment, and branch pickers and names the branch
instead. When another worktree already has the branch checked out, usually the
thread that opened the pull request, the dialog says so and keeps the pickers,
and the thread starts on a new branch and is told to make its own worktree on
the pull request's branch inside that one.

bb does not delete a worktree it did not create, so this plugin removes one
when its thread is archived or deleted and no other thread uses it. `git
worktree remove` keeps a worktree with uncommitted or untracked changes, and
the branch and its commits stay either way. The same applies to worktrees made
by **Open pull request**.

A thread started from the composer whose first prompt names exactly one pull
request, and nothing else, is adopted on the next sweep when that pull request
is in the list: linked to the row and given this plugin's title, unless
another thread already has that title. gh-context reads the prompt; this
plugin decides which of those threads are its own. Archiving a thread releases
it, and unarchiving one gets it adopted again on the next sweep, as long as its
first prompt names that pull request and nothing else.

## Settings

- **Sync interval** — how often the background sweep runs. Default 5 minutes.
- **Path to the gh CLI** — override when `gh` is not on the server's PATH.
- **Only sweep repositories checked out here** — on by default. A repository is
  swept only when a bb project on this machine has it as one of its checkout's
  git remotes, upstream as readily as origin. bb's project
  list is per-installation, so this is what separates the computer a repository
  is checked out on from every other one: the work laptop's repositories stop
  filling the personal one's panel. The skipped repositories are named under
  the list, so an empty panel never reads as "no open pull requests".
- **Repositories that do not need a reviewer** — comma or newline separated
  `owner/name`. Where nobody is ever assigned, an unassigned pull request is
  the normal state rather than something to chase, so the no-reviewer flag is
  skipped for these repositories. Only that flag: a conflict or a red check in
  one of them still reads the same. The row loses the flag as it is classified,
  so with nothing else outstanding it waits rather than sitting under needs you
  with a problem you have decided to ignore.
- **Also sweep these repositories** — comma or newline separated `owner/name`,
  for a repository worth watching without a checkout here. Ignored when the
  filter is off.
- **Stale after (days)** — how long a pull request awaiting review can go
  without an update before it is flagged. Default 3; anything but a positive
  whole number is read as 3.
- **Provider for spawned threads** — defaults to `claude-code`, which is the
  provider the routed skills belong to. Blank uses bb's default.
- **Permission mode for spawned threads** — defaults to `full`. `accept-edits` stops
  at the first shell command; `auto` keeps the workspace sandbox, which blocks
  network egress, so a conflict resolution commits but cannot push. Only `full`
  carries the work through to the PR unattended, and it grants unsandboxed
  command execution in the worktree.
- **Model by action** — a JSON object keyed by flag, picking the model for that
  action's thread. An unlisted flag takes the provider's default model, and a
  malformed value is logged and ignored rather than blocking a spawn.

  ```json
  { "conflict": "claude-sonnet-5" }
  ```

  Worth knowing before tuning this down: `resolve-merge-conflicts` is explicit
  that the conflict markers are the easy part and the real work is the semantic
  collisions git could not mark. Watch the first few conflict threads before
  trusting a cheaper model with them.

## Flags

| Flag | Meaning |
| --- | --- |
| merge conflict | Conflicts with its base branch. |
| CI failing | A red check. |
| reviewer feedback | A live `CHANGES_REQUESTED` or `COMMENTED` review. |
| merge blocked | Approved and green, but a required review or ruleset is unsatisfied. |
| mergeability unknown | GitHub had not computed it, twice. |
| CI cancelled | A run was cancelled; usually needs a re-run. |
| no CI | Zero checks ran. Not the same as green. |
| no reviewer | Non-draft with nobody requested and no reviews. Never raised in a repository named by **Repositories that do not need a reviewer**. |
| CI running | Still in flight. |
| ready to merge | Approved, green, no conflict, not a draft. |

A pull request with a thread attached moves to **working**, whatever its flags
say, so needs you only ever holds work that is actually waiting on you. The
sidebar follows the same rule: the rows in needs you in a red circle, then
those plus the ones ready to merge.

A PR that is answered and awaiting re-review carries no flag: the ball is in the
reviewer's court.

## Where an action sends the work

The row's worst flag picks both the work Start thread names and the skill the
spawned thread is told to use:

| Worst flag | Skill |
| --- | --- |
| merge conflict | `resolve-merge-conflicts` |
| reviewer feedback | `address-code-review` |
| anything else | `pr-sweep` |

Those first two skills specify their own flow, including worktree setup on the
PR's own branch, so the prompt names the skill and states the findings without
restating any method. A thread already on the branch is told to skip that
setup step.

**A pull request with several flags gets one thread that works them in order**,
worst first, finishing each before starting the next. They are sequential
rather than independent: resolving a conflict changes the code review feedback
refers to, and fixing CI changes what is left to answer. One thread also keeps
two agents off the same branch. A step routed to `pr-sweep` adds that skill's
triage guardrails, since it is a playbook rather than a fixed workflow.

Two things follow from that routing:

**Threads spawn on Claude Code.** All three skills are `provider-user` skills
scoped to `claude-code`, so a thread on any other provider cannot see them and
will improvise the workflow instead. The **Provider for spawned threads**
setting pins this; blank falls back to bb's default provider. If you point it
at a provider without these skills, the prompts will name skills that provider
does not have.

**A skill-routed prompt authorizes its own commit and push.** Standing user
instructions forbid committing without an explicit ask and outrank a skill, so
without that paragraph the thread does the work and stops at a staged merge.
Clicking the row's action is the ask. Force-pushing, rewriting a pushed commit,
merging the PR, and posting review replies still require confirmation.

## Development

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit
bb plugin dev     # rebuild and reload on save
```

The check rules are a port of the `pr-sweep` Claude skill at
`~/.dotfiles/claude/skills/pr-sweep/`, which documents why each rule is shaped
the way it is, including the GitHub API traps each one avoids. Read it before
changing `sweep/classify.ts`.

**All test fixtures are synthetic.** This repository is public. Never paste real
pull request titles, reviewer logins, repository names, or URLs into a test.
