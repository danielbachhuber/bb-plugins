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
| `bb reviewmaxx tests` | Each test file on the branch, its tests numbered from 1, and each test's assertions as steps (`1.3`), labelled asserted, snapshot only, or checked to exist. |
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
6. Write the grouping, with a `tests` block on each test concern (step 7), to a temporary file and submit it:

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
7. **For every concern that holds a test file, add a `tests` block.** The
   panel shows it as Gherkin in place of the raw snapshot diff, so a reviewer
   reads what each test proves instead of hundreds of recorded lines. Run
   `bb reviewmaxx tests` for the step ids, then read the tests and the code
   they call.

   ```json
   "tests": {
     "covered": [
       {
         "title": "A manager archives a widget",
         "given": ["the seeded widgets Sprocket and Gadget", "MANAGER is signed in"],
         "when": ["MANAGER archives Sprocket"],
         "then": [
           { "text": "Sprocket comes back stamped with when and by whom", "steps": ["src/widgets/archive.test.ts:1.1"] },
           { "text": "MEMBER's list no longer includes it", "steps": ["src/widgets/archive.test.ts:1.2", "src/widgets/archive.test.ts:1.3"] }
         ]
       }
     ],
     "notCovered": [
       {
         "title": "Archiving a widget that does not exist",
         "reason": "untested",
         "note": "The NOT_FOUND branch is never reached.",
         "evidence": [{ "path": "src/widgets/archive.ts", "line": 23 }],
         "given": ["no widget named ghost"],
         "when": ["MANAGER archives ghost"],
         "then": ["the call is refused as NOT_FOUND"]
       }
     ]
   }
   ```

   - **Covered.** One scenario per behaviour, in the order the test does it.
     Name the actors and actions the way the test does. Each Then line is one
     outcome, citing only the steps that check it: `<file>:<test>.<step>`,
     or `<file>:<test>` for every step of a test. Do not say how it is
     checked; the panel labels each line from the steps. Every test the
     branch changes must be cited, and every snapshot step must be cited
     from the Then line it backs.
   - **Not covered.** List the behaviours the code under test has (each
     permission check, error, input variant, branch, and side effect such as
     an email), then put each one the tests do not try here, with the Given,
     When, and Then a test would need. `reason` is `untested` (no step tries
     it), `unchecked` (it runs but nothing asserts on it, such as a mocked
     email), `never-run` (the code is never reached), or `outside-layer` (this
     kind of test cannot see it). `evidence` is the lines in the code that
     show the gap; each must exist in the checkout. If nothing is missing,
     leave `notCovered` empty and say why in `notCoveredNote`.
8. If `submit` rejects the grouping, fix each problem it lists and submit
   again. Do not stop at a rejected grouping.
9. Tell the user in one line that the grouping is in the Reviewmaxx panel.
