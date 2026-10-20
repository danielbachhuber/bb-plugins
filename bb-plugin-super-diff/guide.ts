// The instructions `bb super-diff guide` prints for the thread's agent.
export const GUIDE = `# Write a Super Diff

The Diff tab can show this thread's diff grouped by concern: each group of files
with a short explanation of why they change together, and notes under the
trickier lines of code. You write the grouping and the notes; the plugin checks
that every changed file is placed exactly once before it stores them.

## Which diff

When the Diff tab's Generate button asked for this Super Diff, every command
works on the diff it asked for; pass no \`--target\`. When you are writing one
on your own, such as at the end of your work, pass \`--target\` to \`read\`,
\`patch\`, and \`submit\` alike, naming the diff the user will review:

- \`uncommitted\`: changes not yet committed
- \`committed\`: the branch's commits against its base
- \`all\`: both together (the default when nobody pressed Generate)

The Diff tab shows a Super Diff only when its picker is on the diff it was
stored for.

## Steps

1. Read the diff with \`bb super-diff read\`. It prints this guide, then every
   changed file, then the patches. If you are reading this guide from it, the
   files and patches follow below; do not run it again. The file list's first
   line names the diff (such as "All changes against origin/main"). Files
   marked [placed by rule] (lockfiles, snapshots, binary files, files too large
   to show) go in a Generated files group by themselves, so \`read\` prints no
   patch for them. Leave them out of your submission.
2. If \`read\` stops before the last patch, read the paths it lists with
   \`bb super-diff patch <path>...\` in one call. Otherwise go straight to
   writing the submission: read and submit should be the only commands you
   need.
3. Every request is a fresh Super Diff. Do not reuse, copy, or resubmit an
   earlier submission or its file, even when the diff has not changed: the
   user is asking for a new reading of it.
4. Group from the diff, not from your memory of writing it. You may have written
   this code; the reviewer has not. Describe what the diff does.
5. Write the submission (below) to a new temporary file, made with
   \`mktemp /tmp/super-diff-XXXXXX\` (no extension: macOS only randomizes
   trailing X's), and run \`bb super-diff submit <that file>\`.
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
- summaries: one line per file, at most about 80 characters, saying what that
  file's change does ("Deletes the old hook; the URL lookup stays"), not what
  the file is in general. The reviewer reads these before opening the files.
- others: when many files in a concern change the same mechanical way, give a
  summary only to the ones that differ and describe the rest together in one
  line ("only the import and call are renamed"). Every file needs a summary
  or to be covered by others.

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
    {
      "title": "...",
      "explanation": "...",
      "files": ["path/one.ts", "path/two.ts", "path/three.ts"],
      "summaries": { "path/one.ts": "..." },
      "others": "..."
    }
  ],
  "annotations": [
    { "path": "path/one.ts", "anchor": "exact text from one line", "title": "...", "body": "..." }
  ]
}
`;
