# Super Diff

Group the Diff tab by concern, with an explanation for each group and notes on the trickier code, written by the thread's agent.

![A Super Diff of a 57-file rename: the Super Diff | Original row listing all six concerns with their viewed counts, then the first concern's numbered heading, a line on what each of its files' change is, its one annotation, and one of its files in bb's diff with that annotation's card under the line it explains](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/super-diff--overview.png)

## Use

- Open a thread's **Diff** tab. A row under the picker offers **Generate Super Diff**; until you click it, the tab shows bb's own list.
- **Generate Super Diff** asks the thread's agent to read the diff and write the Super Diff. Each click asks for a fresh one.
- The grouped list replaces bb's file list in the same tab: each concern's numbered title and explanation, a list of its files saying what each one's change does, then the files as bb's own diff cards. Clicking a file in the list scrolls to its card. Lockfiles, snapshots, binary files, and files too large to show go in **Generated files**.
- Once a thread has a Super Diff, its Diff tab opens on it. **Super Diff | Original** switches between the grouped list and bb's list. Under it, the row lists every concern, highlights the one you are reading, and jumps to one when you click it. The row stays put while the list scrolls. The Super Diff is kept for each thread and picker choice, so it is still there after a reload.
- Notes on the trickier lines sit in cards under the lines they explain. Each concern lists its annotations under its files, with each one's file and line, and clicking one jumps to its card.

![An annotation card, numbered 2: "Feeds the cache key, so the value must not change", with two sentences on why](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/super-diff/super-diff--annotation-card.png)

- When files join or leave the diff after generating, the row turns amber and offers **Regenerate**, and the new files show under **Not yet grouped**. When the thread's base branch changes, the diff is a different one, and the row offers **Generate Super Diff** again; the earlier Super Diff comes back if the base changes back.
- With Diff Viewed installed, each concern shows how many of its files are viewed, and its file list marks which ones. Viewed files start collapsed, as they do in bb's list, and stay that way when you switch to Original and back. Diff Comment's line comments work on the grouped list as they do on bb's.

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

- **Diff Viewed** (`diff-viewed`): a Viewed checkbox on each file of the Diff tab. It works on Super Diff's cards too, and with it installed each concern shows how many of its files you have viewed.
- **Diff Comment** (`diff-comment`): review comments on the lines of a thread's diff. Its comments sit beside Super Diff's notes on the same lines.
- **Super Diff v1** (`super-diff-v1`), retired: grouped a branch's hunks into concerns in a separate panel, written as a narrative. This one keeps bb's own Diff tab and groups whole files.
- **Code Review** (`code-review`): lists the pull requests waiting on your review, runs your review skills over one, and shows what it finds as comments beside the code. It reviews for you; Super Diff arranges a thread's diff so you can read it yourself.

## Develop

```sh
npm install
npx tsc --noEmit
bb plugin build . && bb plugin reload super-diff
```
