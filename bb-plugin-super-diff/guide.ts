// The instructions `bb super-diff guide` prints for the thread's agent.
export const GUIDE = `# Write a Super Diff

The Diff tab can show this thread's diff grouped by concern: each group of files
with a short explanation of why they change together, and notes under the
trickier lines of code. You write the grouping and the notes; the plugin checks
that every changed file is placed exactly once before it stores them.

## Steps

1. Run \`bb super-diff files\`. Its first line names the diff (such as "All changes
   against origin/main"). Files marked [placed by rule] (lockfiles, snapshots,
   binary files, files too large to show) go in a Generated files group by
   themselves. Leave them out of your submission.
2. Read every other file's patch with \`bb super-diff patch <path>...\`, several
   paths per call. If it stops early to stay under the output limit, run it
   again for the paths it lists.
3. Every request is a fresh Super Diff. Do not reuse, copy, or resubmit an
   earlier submission or its file, even when the diff has not changed: the
   user is asking for a new reading of it.
4. Group from the diff, not from your memory of writing it. You may have written
   this code; the reviewer has not. Describe what the diff does.
5. Write the submission (below) to a new temporary file, made with
   \`mktemp /tmp/super-diff-XXXXXX.json\`, and run \`bb super-diff submit <that file>\`.
6. If it is not stored, fix every problem it lists and submit again until it is.
7. Tell the user in one sentence how many concerns and annotations were stored.
   Do not change any code.

## Concerns

- A concern is a part of the change with one purpose: a new behavior, a rename
  across many call sites, the tests for a change, a fix to a bug found on the way.
- Order them most important first: the change a reviewer must understand to
  follow the rest comes first; mechanical follow-on edits come last.
- Every file goes in exactly one concern, whole. A file that serves two purposes
  goes with the concern most of its change belongs to.
- Title: a few words, sentence case, saying what the change does
  ("Show an error when a widget fails to save"), not a file or folder name.
- Explanation: one or two sentences saying why these files change together and
  what a reviewer should look for. Plain words; no "This concern...".
- Aim for 2 to 7 concerns. A 3-file diff may have one.

## Annotations

- Only where a careful reviewer would stop and ask: a workaround, a
  non-obvious mechanism, coupling to another file or system, a subtle
  invariant, a behavior change hidden in a small edit, something easy to get
  wrong. Never restate what the code plainly says. Many diffs need 0 to 5.
- path: the file. anchor: text copied exactly from ONE added or unchanged line
  of that file's patch (not a removed line), long enough to match only that
  line. The note shows directly under it.
- title: at most about 60 characters, saying the point ("Falls back to the default
  currency when a store has none").
- body: one to three sentences explaining what the reader would otherwise have
  to work out. Wrap code names in backticks.

## Submission

{
  "concerns": [
    { "title": "...", "explanation": "...", "files": ["path/one.ts", "path/two.ts"] }
  ],
  "annotations": [
    { "path": "path/one.ts", "anchor": "exact text from one line", "title": "...", "body": "..." }
  ]
}
`;
