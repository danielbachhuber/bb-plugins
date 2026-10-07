# Super Diff

Review a branch one concern at a time. bb's changes panel lists a branch's
files in path order; Super Diff adds a panel beside the thread that groups the
branch's hunks into concerns, the parts of the change that belong together,
each with a short note on what its hunks do and why they go together. The
thread's own agent writes the grouping, and the plugin checks it against the
real diff before accepting it, so every hunk on the branch appears in the panel
exactly once.

![The Super Diff panel: a one-sentence headline and a viewed bar, the first concern on the left with its note and two files, and a rail of concerns on the right with each one's viewed count and lines changed](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/review-panel--grouped.png)

From top to bottom, the panel shows:

1. A one-sentence headline saying what the branch changes, and under it a bar
   of every changed file, described in [The bar of files](#the-bar-of-files).
2. When the branch has moved on since the grouping, a banner and a
   **Changed since grouping** section.
3. Down the right, a rail of the concerns, numbered, most important first,
   each with a ring that fills as its hunks are read, its lines added and
   removed, and how many of its files are viewed. It stays in place as you scroll. Choosing one shows it on the left;
   **Next** at the bottom of a concern moves to the one after. On a panel too
   narrow for both, the rail sits above instead.
4. On the left, the chosen concern: its title and note, then each file as a
   header bar with its path, its lines added and removed, and a **Viewed**
   box kept in step with GitHub's or the changes panel's, over its hunks,
   each opening with a checkmark. A file that serves two purposes is split
   between concerns by hunk, labelled "hunks 1 and 3 of 4".
5. At the end of the rail, **Not yet grouped** for any hunk no concern holds,
   and **Mechanical** for lockfiles, snapshots, and generated files.
6. A count of files and hunks, and whether all of them are shown.

![A concern that changes code and tests: its source files as diffs, then a Tests heading with a Scenarios and Diff toggle, its scenarios listed with their asserted and snapshot counts, the first one as highlighted Gherkin with its recorded value folded to a line count, and a dashed block of the scenarios no test tries](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/review-panel--code-and-tests.png)

## The bar of files

The bar under the headline is the branch itself: one segment per changed
file, in the order `git diff` lists them, sized by the lines it changes, with a
block for each hunk that fills once you have viewed it. Each file's name sits
under its segment, and clicking a block opens the concern that holds it. Beside
the bar, "3 of 8 hunks viewed" counts hunks, not files, since a file split
between concerns is read a concern at a time.

When the files would be too narrow to name, the bar groups them by directory
instead, such as "src/api/ 23", each file still a sliver inside that fills by
the share of its lines read. It uses the deepest directories that fit, and
shorter ones when they do not, so a long branch in a narrow panel shows its
top-level directories. A segment too narrow for a label is named on hover.

After the count, "same files as bb" says that bb's own changes panel lists the
same files against the same base. bb counts them with its own code, so the two
agreeing is evidence that nothing on the branch is left out, rather than Super
Diff vouching for itself. When they disagree, the note turns red and names the
file only one of them lists. When bb cannot give its list, the note says the
files were not checked.

## More context around a hunk

Each hunk shows a few lines around its change, with the rest of the file
folded into "unmodified lines" bars above and below. Click a bar's arrow to
show more of the file, or **Expand all** for the whole of it. The context is
the file as it is now, with the branch's other changes in it, since that is the
code the hunk sits in. In a file whose earlier hunks add or remove lines, the
line numbers beside removed lines follow the file as it is now rather than the
base.

The file is read from disk once the hunk is drawn, once per version of the
file's diff, however many of its hunks are on screen. A binary or very large
file has no context to show, and its hunks draw as before.

Long lines wrap. **Unwrap**, beside Regenerate at the top, scrolls them
sideways instead in every diff in the panel, and **Wrap** turns wrapping back
on. The choice holds until bb is reloaded.

## Checking off hunks, and Viewed

Each hunk opens with a strip: a round checkmark, then "Hunk 1 of 2". Check it
once you have read the hunk, and the hunk folds to its strip; click the
strip's text to open it again without unchecking it. Once any hunk is checked,
the card's header counts them, as in "2 of 5 hunks reviewed". A card whose
hunks are all read folds to its header, which shows a green check beside "5 of
5 hunks reviewed". In the rail, each concern's ring fills with its share of
hunks read, and a concern whose hunks are all read turns into a green check
and says "Reviewed". The bar at the top fills hunk by hunk.

A check belongs to one hunk, kept per thread against that hunk's lines. A file
split between concerns is read a concern at a time, and when a commit or an
edit changes a hunk's lines, that hunk comes back unchecked while the file's
others stay checked. Checks survive regenerating the grouping.

**Viewed** on a file is kept in step with a per-file Viewed somewhere else:
GitHub's, on the thread's open pull request, or with no pull request, the
**Viewed** boxes the Diff Viewed plugin adds to bb's changes panel. It shows
only when there is one of those to keep in step with:

- When the thread has an open pull request and the file's `+a −d` counts here
  are the pull request's, the file's header has **Viewed**. Checking the last
  unchecked hunk of the file marks it Viewed on GitHub; unchecking any of its
  hunks unmarks it there and keeps the others checked. Checking **Viewed**
  checks every hunk of the file, in every concern, and unchecking it clears
  them. A file marked Viewed on GitHub shows all its hunks checked, the next
  time the panel opens or the window regains focus; a file GitHub reports as
  changed since you viewed it shows unchecked, as it does there.
- When the file differs from the pull request's, as with unpushed edits or a
  new untracked file, the header says "not on GitHub yet" instead. Its
  checkmarks still work and stay in bb, and GitHub is left alone.
- With no open pull request and Diff Viewed installed, every file's header
  has **Viewed**, and it is the changes panel's: it works as above, with the
  changes panel in place of GitHub. A file Diff Viewed marked shows its hunks
  checked while its `+a −d` counts are the ones it was marked at.
- With neither, or with sync turned off, there is no Viewed box, and the
  checkmarks are kept in bb. A failing `gh` or a Diff Viewed that does not
  answer is logged once.

When GitHub or Diff Viewed refuses a change, the panel says what it said, and
the checkmarks you set stay as you left them.

Sync with GitHub uses `gh`, signed in as you (`gh auth login`). Super Diff
talks to Diff Viewed only through its two RPC methods, `viewed_list` and
`viewed_set`, and works without it. To turn either sync off, or point at a
different `gh`:

```sh
bb plugin config super-diff set syncGithub off
bb plugin config super-diff set syncChangesPanel off
bb plugin config super-diff set ghPath /opt/homebrew/bin/gh
```

## Test concerns

A concern with scenarios shows its code first and its tests after. Its source
files come first as diffs, like any other concern's. Below them, under
**Tests**, the test files are shown as **Scenarios**, with **Diff** one click
away for the raw test files. The toggle switches only the test files, so the
code a concern changes is never hidden behind it. A concern that is only tests
starts on Scenarios with the toggle beside its title. In the rail, a concern
that is only tests is tagged "tests", and one that also changes code shows its
scenario count. Test files are those named `*.test.*` or `*.spec.*` or under
`__tests__/`, and their output is anything under `__snapshots__/` or ending in
`.snap`.

Scenarios has three parts, the Gherkin drawn by bb's own source viewer:

- **The scenarios, listed.** Each with how many of its steps are asserted
  and how many are snapshot only, and a checkmark for the test hunks behind
  it. Choosing one shows it below.
- **The chosen scenario.** Its Given, When, and Then lines in the agent's
  words. Under each Then line are the assertions that check it, numbered as
  `1.3` and marked asserted, snapshot only, or checked to exist. A recorded
  snapshot value folds to a note on its step, such as `(recorded: 20 lines)`,
  so the scenario reads straight through; **Show values** puts each value back
  in full as a `"""` block under the step that wrote it.
- **What the tests leave out.** A dashed block of the scenarios a test would
  need, each tagged with why it is a gap (`@untested`, `@unchecked`,
  `@never-run`, or `@outside-layer`), with a note and the code location as
  comments.

A scenario's hunks are the concern's test hunks that overlap the test() calls
it cites, and the hunks of those test files' snapshots. Under its title it says
how far through them you are: "2 hunks", "1 of 2 hunks reviewed", or a green
"reviewed", or "no changed lines" when the tests it cites are not changed on
the branch. Its checkmark checks or unchecks all of them at once, the same
checks the hunks have in **Diff**, so reading a test either way counts. The
line above the list counts the test hunks reviewed. A test hunk outside every
scenario, such as an import, a helper, or a `test.each` the step listing does
not number, is named under that line with a link to review it in **Diff**,
since no scenario's checkmark reaches it.

The agent writes one scenario per behaviour, so the scenarios need not match
the test() calls one to one: a single test that checks three things can
become three scenarios, and one scenario can describe several tests. The panel
says when that happens, since a reader expects one scenario per test. A note
above the list counts the scenarios against the tests they describe, such as
"3 scenarios describe 1 test() call", and each scenario that is not one whole
test of its own says why: "22 of 46 steps of one test", "spans 2 tests", or
"shares its test with 1 other scenario". The plugin works this out from the
step ids each scenario cites, so it needs nothing from the agent.

The plugin does the mechanical part itself. It parses each test file with the
TypeScript compiler into tests and assertions, counting calls to assertion
helpers named `expect…` or `assert…`, such as `expectPosted(post)`, as asserted
steps. A helper named otherwise is counted when the agent lists it in the
grouping's `assertionHelpers`, after reading the test-support code; `submit`
rejects a listed name that no test calls, and the list is kept with the
grouping so its step numbers stay the same. It reads the `.snap` file beside it
in `__snapshots__/`, and pairs each snapshot entry with the call that wrote it,
using the `<test name> <counter>` naming that Jest and Vitest share. The agent
writes only the scenario wording and cites the step ids. `submit` rejects a
grouping where a test the branch changes is not described, a snapshot step is
not cited from the Then line it backs, a cited step does not exist, a gap's
code location is not in the checkout, or a test concern has no Not covered list
and no reason for leaving it empty.

## Using it

Open the thread's right panel, open a new tab, and pick **Super Diff**. Before
anything is grouped, it shows every hunk under Not yet grouped.

**Generate** sends this thread a message asking its agent to group the branch.
If the agent is busy, the message waits in bb's queue. The agent follows the
`super-diff` skill: it reads the numbered hunks with `bb super-diff hunks
--full` and the numbered test steps with `bb super-diff tests`, writes a
headline, the concerns, and scenarios for each test concern, and submits them
with `bb super-diff submit`. A submission that leaves a hunk out, puts one in two
concerns, or names a file or hunk that is not in the diff is rejected with a
list of what to fix, and the agent submits again. The panel updates when a
grouping is accepted.

You can also ask for a grouping in chat. The skill tells the agent to group
from the diff rather than from what it remembers meaning to do, since the
agent in the thread usually wrote the code.

## What it reads

Always the whole branch against its merge base with the environment's base
branch: committed changes, uncommitted edits, and untracked files together.
There is no range to pick. To review someone else's pull request, check its
branch out in a thread's environment.

The base is the local branch, such as `main`, or its remote-tracking branch,
such as `origin/main`, whichever is further along this branch's history. A
local `main` that has not been pulled would otherwise count everything merged
since as part of the branch; a local `main` with unpushed commits the branch
builds on is used as it is. The remote-tracking branch is as fresh as the
last fetch, and the plugin never fetches. The count at the bottom of the panel
names the base, as in "25 files, 61 hunks, all shown, against origin/main".

It reads the diff with `git` in the environment's checkout, so the environment
has to be a git checkout on the machine bb runs on. Anything else gets a
message saying so.

## Built for any repository

Super Diff has to work on any git repository, so nothing in it should assume
one codebase's layout, test framework, naming, or helpers. When a feature
needs to know something about a repository, it gets it from one of three
places, and never from a path or a name written into the plugin:

- A general rule that holds across projects, such as Jest and Vitest naming
  each snapshot entry after its test and a counter, or lockfile names.
- The agent's own reading of the diff and the code, passed in through the
  grouping it submits, such as the assertion helpers a repository's tests use
  under names the convention does not catch.
- A plugin setting, for anything that differs between repositories and that
  neither of the above can supply.

Tests and stories use invented repositories, such as `acme/widgets`, so a
fixture never quietly encodes one real project's structure.

## When the branch moves on

The grouping is kept until you regenerate it, even after a commit. When it is
accepted, the plugin stores the content of every changed file at that moment.
Each time the panel opens, it compares those contents with the files now. If
nothing differs, the grouping is current, including after a commit of exactly
the work it grouped.

![The stale banner: "Grouped at a1b2c3d, 1 commit and 1 file changed since", a Regenerate button, and the diff of the one file that changed](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/review-panel--stale.png)

If something differs, a banner says when the grouping was made and how many
commits and files have changed since, or that the branch was rewritten when
the grouped commit is no longer on it. **Changed since grouping** shows the
diff from the stored contents to the files now, which is exactly what changed,
whether by commit or by edit. Inside the concerns, a hunk whose lines changed
is marked "changed since grouping", a hunk that is gone is struck through, and
a new hunk goes to Not yet grouped.

Nothing is written into the repository. The stored contents live in the
plugin's own database in bb's data directory.

## Verifying that every hunk is shown

Two deterministic checks, each exiting 1 on any gap:

```sh
bb super-diff verify                      # from the thread
npm run verify -- <thread id>             # in this directory, with bb running
```

`bb super-diff verify` lists the changed paths with `git`, builds the panel's
view from the branch and the stored grouping, and reports any path the parser
missed and any hunk the view shows zero times or twice: "3 files, 3 hunks: 3
shown once, 0 missing, 0 twice." The grouping itself was checked when it was
submitted; a hunk added since then shows under Not yet grouped, which still
counts as shown.

`npm run verify` runs that first, then opens the thread in bb with Playwright,
opens the Super Diff panel, chooses each concern in the rail in turn, switches
concerns with tests to Diff, waits for every diff to draw, and checks that the
hunks on the page are exactly the hunks on the branch, once each. It also
fails on a console error, a diff that never draws, or content wider than the
panel, and saves light, dark, and narrow screenshots to
`/tmp/super-diff-verify/`. It uses the Playwright install at
`~/.claude/tools/playwright`.

### Each shape a concern can take

A concern can be code only, code and tests, tests only, or scenarios over
files that are not tests, and its scenarios can match its test() calls one to
one or not. Each draws differently, and a change made for one
has hidden another's code before. So each shape has a test under "concern
shapes" in `components/review-screen.test.tsx`, checking which hunks show, where
the toggle sits, and what the rail says, and each has a story in
`review.stories.tsx`, so the screenshot capture records how it looks. A new
shape gets both.

## What it runs

Each time the panel opens, it runs these `git` commands in the checkout:
`rev-parse` (including one for the base's upstream), `merge-base` (one for
the base, one for its remote-tracking branch, and one `--is-ancestor` to
compare them), `diff`, `diff --name-only`, `ls-files`, and one
`diff --no-index` for each untracked file. Once a grouping exists, it also
reads each changed file from disk, runs one `cat-file` for each path the stored
contents do not cover, and one `diff --no-index` for each file that changed
since the grouping. For each test file on the branch, it reads the file and its
`.snap` file from disk and parses them. Checking a hunk or a file's Viewed
runs the same `git` commands once to find the file's current diff. Drawing a
hunk reads its file from disk once, for its context. Opening the
panel also asks bb once for its own list of the branch's changed files against
the same base, for the check beside the bar; on a 25-file branch that adds
about 80 ms. Generate sends one message to the thread.

With sync on and an open pull request, opening the panel or refocusing the
window asks GitHub, through `gh`, for the pull request's files and your Viewed
state: one GraphQL query per 100 files, kept for 30 seconds per thread, with
one request shared between callers. It runs while `git` does, and the first
open of a thread takes about 1.5 seconds with it. Each time a file crosses
between read and unread, one mutation marks or unmarks it. Nothing is sent per
hunk, and nothing else calls GitHub.

With no open pull request, opening the panel or refocusing the window asks
Diff Viewed for the thread's marks: one local RPC call, not cached. Each time a
file crosses between read and unread, one more call marks or unmarks it.

## Related plugins

- **Code Review** (`code-review`) lists the pull requests waiting on your
  review, runs your review skills over one, and turns the findings into
  comments you post on GitHub. Super Diff does not post anything; it
  reorganises the local diff for reading.
- **Diff Dad** (`diffdad`) narrates GitHub pull requests through its own
  daemon, with a verdict and concerns. Super Diff takes its idea of grouping
  hunks into chapters, but works on the local branch, inside bb, with the
  thread's own agent.
- **Diff Viewed** (`diff-viewed`) and **Diff Comment** (`diff-comment`)
  decorate bb's own changes panel with Viewed checkboxes and inline comments.
  Diff Viewed keeps its checkboxes in step with GitHub's per file; Super Diff
  follows the same rules but checks off hunks, so a file split between
  concerns can be read a concern at a time, and it is a separate panel that
  regroups the same changes. With no pull request, Super Diff uses Diff
  Viewed's checkboxes as a file's Viewed, so the two panels agree.

## Layout

| Path | Holds |
| --- | --- |
| `review/` | The core: parsing the diff, the coverage check, the view, staleness, with `git.ts` for every `git` call and `store.ts` for the database |
| `review/tests/` | Test concerns: parsing tests and snapshot files, checking scenarios against them, and writing the Gherkin |
| `components/` | The panel, split from data loading so stories render it |
| `skills/super-diff/` | The skill the agent groups the branch with |
| `scripts/verify.mjs` | The rendering half of verify |
| `review.stories.tsx` | Stories for each state of the panel |
