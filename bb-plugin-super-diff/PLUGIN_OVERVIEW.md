## What you get

- A **Generate Super Diff** button in the Diff tab. The thread's agent groups the changed files into concerns, each with a title and a short explanation, in place of bb's file list.
- A line under each concern for every file, saying what its change does, and bb's **Viewed** checkbox on each file, with a count of viewed files per concern.
- Notes in the diff under the lines a reviewer might misread, and **Explain this** on any other line for a note written on request.
- An amber **Out of date** warning with **Regenerate** when files are added or edited after the Super Diff was written.

## How it works

The agent reads the diff with `bb super-diff read` and stores its grouping with `bb super-diff submit`, which checks that every file is placed exactly once. Super Diff keeps one per thread and diff on this machine and calls no outside service. **Explain this** asks a hidden side chat of the thread, so the thread's agent is not interrupted.

## For agents

The `super-diff` skill tells an agent to run `bb super-diff read` and follow the guide it prints. An agent can write a Super Diff at the end of its own work without anyone pressing Generate.

## Requirements

A thread with a git environment, and bb 0.47 or later for the Viewed checkboxes. Nothing to configure.
