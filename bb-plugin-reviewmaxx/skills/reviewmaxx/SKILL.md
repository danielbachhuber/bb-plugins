---
name: reviewmaxx
description: Group this branch's changes into concerns for the Reviewmaxx panel, using the `bb reviewmaxx` CLI. Use when the user asks for a Reviewmaxx grouping, asks to group or regroup the branch's changes for review, or the Reviewmaxx panel's Generate button sent the request.
---

# Group the branch for review

The Reviewmaxx panel shows this branch's changes grouped into concerns: the
parts of the change that belong together, most important first, each with a
short note. You write the grouping; the plugin checks that every hunk on the
branch is in exactly one concern before it accepts it.

## Commands

| Command | Effect |
| --- | --- |
| `bb reviewmaxx hunks` | Every file with its hunks numbered from 0. Mechanical files (lockfiles, snapshots, generated output) are marked. |
| `bb reviewmaxx hunks --full` | The same, with each hunk's lines under a `### path#n` marker. |
| `bb reviewmaxx submit <file>` | Check the grouping and store it. Exits 1 with a list of problems if any hunk is missing, in two concerns, or unknown. |

## Procedure

1. Run `bb reviewmaxx hunks --full` and read every hunk.
2. **Group from the diff, not from memory.** You may have written this code.
   Group by what each hunk does as it reads in the diff, not by what you
   meant it to do or the order you wrote it in. A reviewer will read the
   concerns, not your intent.
3. Write one sentence saying what the branch changes. If you cannot, read
   more before grouping.
4. Group the hunks into concerns by purpose, not by folder. Put the most
   important concern first; the panel opens it. A file that serves two
   purposes is split by hunk number. Incidental changes, such as a doc tweak
   or a renamed import, get a small concern of their own.
5. For each concern, write a `title` (a few words) and a `note`: one to three
   sentences on what its hunks do together and why they belong together.
6. Write the grouping to a temporary file and submit it:

   ```json
   {
     "headline": "One sentence saying what the branch changes.",
     "concerns": [
       {
         "title": "Add the sprocket",
         "note": "What these hunks do, and why they belong together.",
         "files": ["src/sprocket.ts", { "path": "src/widget.ts", "hunks": [0, 2] }]
       }
     ]
   }
   ```

   ```bash
   bb reviewmaxx submit /tmp/reviewmaxx-grouping.json
   ```

   A bare path means every hunk in that file. Mechanical files need no
   concern; list one only when it shows the change, such as a snapshot.
7. If `submit` rejects the grouping, fix each problem it lists and submit
   again. Do not stop at a rejected grouping.
8. Tell the user in one line that the grouping is in the Reviewmaxx panel.
