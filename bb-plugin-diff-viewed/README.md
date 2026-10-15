# Diff Viewed

Use a Viewed checkbox on each file to keep track of what you've read in a long diff, synced with GitHub on the thread's pull request.

![bb's changes panel with README.md, src/cart.ts, and src/inventory.ts checked Viewed, collapsed, and dimmed above src/pricing.ts, which is still open, and "3/6 viewed" with a progress ring in the toolbar](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/diff-viewed/changes-panel--viewed.png)

## Use

- Open the changes panel (⌘ D). Each file header has a **Viewed** checkbox beside its `+N -M` counts.
- Check a file to collapse and dim it. The files still open are the ones you have not read. Uncheck it to bring it back.
- The toolbar counts the files you have viewed, such as **3/6 viewed**, across the whole range, including files you have not scrolled to.
- Pick **Only unviewed** at the bottom of the range dropdown (**All changes**, **Uncommitted changes**) to hide viewed files. Pick it again to show them.

![The range dropdown open with All changes and Only unviewed checked, over a list that starts at src/pricing.ts because the three viewed files are hidden, while the toolbar still reads 3/6 viewed](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/diff-viewed/changes-panel--only-unviewed.png)

- A mark clears itself when that file's `+N -M` counts change, such as after a rebase or a new hunk, so the file opens again for you to reread.
- When the thread has an open pull request, a mark is the same as GitHub's **Viewed** box on that file. A file whose diff in bb differs from GitHub's, such as one with edits you have not pushed, shows a crossed-out cloud for **Local**: the mark stays in bb, and goes to GitHub once a push makes the diffs match.

![src/pricing.ts checked Viewed with a crossed-out cloud before the checkbox, because its +12 -1 in bb differs from the pull request's, and "4/6 viewed" in the toolbar](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/diff-viewed/changes-panel--local.png)

Marks are kept per thread in bb and survive a restart.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `syncGithub` | `on` | Share marks with GitHub's Viewed boxes. Set to `off` to keep them in bb only. |
| `ghPath` | `gh` | The `gh` CLI used for GitHub calls. |

## Requirements

bb 0.41 or later. GitHub sync needs `gh` signed in (`gh auth login`); without it, marks stay in bb. Opening a thread's changes panel, and returning to the window, makes one GraphQL query for the pull request's files, reused for 30 seconds. Each click on a file that syncs is one mutation, and so is each Local mark that a push brings into line, sent once.

## Related plugins

- **Guided Review** (`guided-review`): turns a GitHub pull request or a local Git range into chapters to read, with its own viewed tracking, notes, and a review to submit. Diff Viewed adds only a checkbox to bb's own changes panel, and needs no agent provider.
- **Diff Explorer** (`diff-explorer`): every changed file in one scroll, with go to definition. It is a separate view of the diff; Diff Viewed marks files in bb's changes panel.
- **Super Diff** (`super-diff`), in this repository: groups a branch's hunks into concerns, with a summary of each, and lets you check off each hunk. With no pull request, it uses Diff Viewed's marks.
- **Diff Comment** (`diff-comment`), in this repository: leave review comments inline on the same changes panel for the agent to work through. Diff Viewed tracks what you have read; Diff Comment records what you want changed.

## Develop

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload diff-viewed
```
