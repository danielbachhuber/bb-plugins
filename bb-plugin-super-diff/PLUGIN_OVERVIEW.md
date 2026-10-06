## What you get

A **Super Diff** panel beside each thread that shows the branch's changes
grouped into concerns, most important first, each with a short note on what
its hunks do. Lockfiles, snapshots, and generated files are set aside in a
collapsed group, and a count at the bottom says how many hunks are shown.

**Generate** asks the thread's agent to write the grouping. The plugin accepts
it only when every hunk on the branch is in exactly one concern, so nothing on
the branch is left out of the review.

A bar under the headline shows every changed file, grouped by directory on a
long branch, filling as its hunks are read, and says whether bb's own changes
panel lists the same files.

Check off each hunk as you read it; it folds away, the bar counts your
progress, and a hunk whose lines change comes back unchecked. When the thread
has a pull request, a file's **Viewed** is GitHub's own: reading every hunk of
a file marks it Viewed on GitHub, and a file Viewed there shows checked here.

A concern shows its code changes first, then its tests as **Scenarios**: what
the tests check, as Gherkin with each recorded snapshot value under the step
that wrote it, and a second block of the scenarios no test tries, each tagged
with why. **Diff** shows the raw test files in their place. When the scenarios
do not line up one to one with the test() calls, such as three scenarios
written from one test, the panel says so.

## When the branch moves on

The grouping stays until you regenerate it. After a commit or an edit, a
banner says how many commits and files have changed since, and shows exactly
what changed. Hunks that changed are marked, and new ones are listed as not
yet grouped.

## Requirements

- The thread's environment must be a git checkout on the machine bb runs on.
- Nothing is written into the repository.
- Syncing Viewed with GitHub needs `gh`, signed in. Without it, checkmarks stay
  in bb.
