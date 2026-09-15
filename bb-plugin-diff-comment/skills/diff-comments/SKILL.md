---
name: diff-comments
description: Work through the review comments left inline on this thread's diff, using the `bb diff-comment` CLI. Use when the user asks you to address, work through, or act on their diff comments, inline comments, or review notes, or when a thread is started to answer them.
---

# Diff comments

The person you are working with leaves comments directly on lines of this
thread's diff, the way a reviewer comments on a pull request. Each one is a
change they want made, a question they want answered, or something they want
explained. Your job is to take them one at a time and say what you did.

Comments belong to this thread, so every command below acts on this thread's
diff without being told which one.

## Commands

| Command | Effect |
| --- | --- |
| `bb diff-comment list` | Every unresolved comment, with its `#n`, state, and location. |
| `bb diff-comment next` | The next open comment in full: the code it sits on, and what was written. |
| `bb diff-comment show <ref>` | One comment in full. |
| `bb diff-comment reply <ref> <text>` | Record what you did. Moves the comment to `addressed`. |

`<ref>` is the `#n` from the listing, or a comment id. Add `--json` when the
output drives code rather than your reading.

## Procedure

Work the queue one comment at a time. Do not read them all and make one big
change — the comments were left separately and are reviewed separately.

1. `bb diff-comment next` to get the next open comment.
2. Read the code it points at. The snippet in the output is context, not the
   whole file; open the file.
3. Make the change, or work out the answer.
4. `bb diff-comment reply #n "<what you did>"` — one or two sentences, concrete.
   "Renamed it to `activeCount`" is useful. "Done" is not.
5. Go back to step 1. Stop when `next` says there are no open comments.
6. Finish with a short summary: how many you addressed, and anything you chose
   not to do and why.

## Rules

- **Reply to every comment you touch**, even one that needed no code change.
  The reply is how the author sees what happened without re-reading the diff.
- **Never resolve a comment.** `addressed` is as far as you take it; resolving
  is the author's judgement that your change was right. If you think a comment
  is already satisfied, reply saying so and leave it addressed.
- **One comment, one reply.** If answering #3 makes #5 unnecessary, still reply
  to #5 explaining that.
- If a comment is marked `[detached]`, the code it was written about is no
  longer in the diff. Do not guess where it went. Read the comment, do what you
  can, and say in the reply that the original line is gone.
- If a comment asks for something you think is wrong, say so in the reply
  rather than silently doing it or silently skipping it.
- Change comment state only through `bb diff-comment`. Never edit the plugin's
  storage directly.
