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

1. A one-sentence headline saying what the branch changes, and a bar counting
   how many files you have marked viewed.
2. When the branch has moved on since the grouping, a banner and a
   **Changed since grouping** section.
3. Down the right, a rail of the concerns, numbered, most important first,
   each with its lines added and removed and how many of its files are
   viewed. It stays in place as you scroll. Choosing one shows it on the left;
   **Next** at the bottom of a concern moves to the one after. On a panel too
   narrow for both, the rail sits above instead.
4. On the left, the chosen concern: its title and note, then each file as a
   header bar with its path, its lines added and removed, and a **Viewed**
   checkbox, over its hunks. A file that serves two purposes is split between
   concerns by hunk, labelled "hunks 1 and 3 of 4".
5. At the end of the rail, **Not yet grouped** for any hunk no concern holds,
   and **Mechanical** for lockfiles, snapshots, and generated files.
6. A count of files and hunks, and whether all of them are shown.

![A concern that changes code and tests: its source files as diffs, then a Tests heading with a Scenarios and Diff toggle, its scenarios listed with their asserted and snapshot counts, the first one as highlighted Gherkin with its recorded value folded to a line count, and a dashed block of the scenarios no test tries](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/review-panel--code-and-tests.png)

## Marking files viewed

Check **Viewed** on a file once you have read it. The file folds and dims, the
bar at the top fills, and its concern's entry in the rail counts it; a concern
whose files are all viewed gets a check. A mark is kept per thread and per
file, against that file's diff at the time. When the file's diff changes, by a
commit or an edit, its mark clears itself, so a changed file always comes back
unread. Marks belong to files, not concerns, so they survive regenerating the
grouping.

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
  and how many are snapshot only. Choosing one shows it below.
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
`.snap` file from disk and parses them. Marking a file viewed runs the same
`git` commands once to find the file's current diff. Generate sends one message
to the thread. Nothing calls GitHub or any other service.

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
  Super Diff is a separate panel that regroups the same changes.

## Layout

| Path | Holds |
| --- | --- |
| `review/` | The core: parsing the diff, the coverage check, the view, staleness, with `git.ts` for every `git` call and `store.ts` for the database |
| `review/tests/` | Test concerns: parsing tests and snapshot files, checking scenarios against them, and writing the Gherkin |
| `components/` | The panel, split from data loading so stories render it |
| `skills/super-diff/` | The skill the agent groups the branch with |
| `scripts/verify.mjs` | The rendering half of verify |
| `review.stories.tsx` | Stories for each state of the panel |
