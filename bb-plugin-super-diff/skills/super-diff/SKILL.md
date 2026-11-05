---
name: super-diff
description: Write a Super Diff for this thread's diff, grouping the changed files by concern with explanations and notes on tricky code, using the `bb super-diff` command. Use when the Diff tab's Generate Super Diff button sent the request, the user asks to group the diff by concern for review, or your instructions ask you to write one for your own work.
---

# Write a Super Diff

Run `bb super-diff read` and follow the guide it prints exactly. One call
prints the guide, every changed file, and their patches, so you can write the
submission straight away and store it with `bb super-diff submit`. The guide
explains what makes a good concern and annotation.

Before writing one on your own, run `bb super-diff status --target <diff>`.
It exits 0 when this diff already has a Super Diff that is up to date, 2 when
it has none, and 3 when the diff has changed since it was written.
