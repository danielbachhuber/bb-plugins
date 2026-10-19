# Super Diff

Group the Diff tab by concern, with an explanation for each group and notes on the trickier code, written by the thread's agent.

![The Super Diff row under the Diff tab's picker: an Original | Super Diff toggle with Super Diff selected, and "3 concerns · 2 annotations · generated 4 min ago"](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/super-diff--showing-super-diff.png)

## Use

- Open a thread's **Diff** tab. A row under the picker offers **Generate Super Diff**; until you click it, the tab shows bb's own list.
- **Generate Super Diff** asks the thread's agent to read the diff and write the Super Diff. Each click asks for a fresh one.
- The grouped list replaces bb's file list in the same tab: each concern's title and explanation, then its files as bb's own diff cards. Lockfiles, snapshots, binary files, and files too large to show go in **Generated files**.
- **Original | Super Diff** switches between bb's list and the grouped list. The Super Diff is kept for each thread and picker choice, so it is still there after a reload.
- A box at the top lists every annotation with its file and line, and clicking one jumps to its card under the line it explains.

![The annotation list: four numbered notes with their titles and file:line, one marked "not in this diff"](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/super-diff--annotation-list.png)

- When files join or leave the diff after generating, the row turns amber and offers **Regenerate**, and the new files show under **Not yet grouped**.
- Diff Viewed's checkboxes and Diff Comment's line comments work on the grouped list as they do on bb's.

## For agents

The `super-diff` skill tells agents to run `bb super-diff guide` and follow it.

```sh
bb super-diff guide                 # how to write a Super Diff
bb super-diff files                 # every changed file, and which ones the plugin places itself
bb super-diff patch <path>...       # the patches for those paths
bb super-diff submit <file | json>  # check a Super Diff and store it if every file is placed once
```

## Requirements

A thread with a git environment. Generate sends one message to the thread's agent, then checks for its result every 2 seconds. Showing the Super Diff reads the diff from bb once: one request for the file list and one per 50 files for patches. Nothing calls GitHub.

## Related plugins

- **Diff Viewed** (`diff-viewed`): a Viewed checkbox on each file of the Diff tab. It works on Super Diff's cards too, so you can read one concern at a time and tick files off.
- **Diff Comment** (`diff-comment`): review comments on the lines of a thread's diff. Its comments sit beside Super Diff's notes on the same lines.
- **Super Diff v1** (`super-diff-v1`), retired: grouped a branch's hunks into concerns in a separate panel, written as a narrative. This one keeps bb's own Diff tab and groups whole files.
- **Code Review** (`code-review`): lists the pull requests waiting on your review, runs your review skills over one, and shows what it finds as comments beside the code. It reviews for you; Super Diff arranges a thread's diff so you can read it yourself.

## Develop

```sh
npm install
npx tsc --noEmit
bb plugin build . && bb plugin reload super-diff
```
