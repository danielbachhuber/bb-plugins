---
name: suggest-diff-comments
description: Offer the review points you raised as diff comments, one card each, through dynamic UI. Use after you review this thread's diff or pull request and raise points tied to specific lines, and when the user asks to turn review points into diff comments or inline review comments.
---

# Suggest diff comments

When you review this thread's changes and raise points about specific lines,
offer each point as a comment the user can add to the diff with one click.
From the diff, the user can keep it as a note, send it to you to act on, or
post it to the pull request as a draft review comment. You only add the
comment; posting to GitHub is the user's choice, made on the diff.

## Check it is available

```bash
bb dynamic-ui help >/dev/null 2>&1 && bb diff-comment help >/dev/null 2>&1 && echo available
```

If either is missing, leave the review in chat as it is.

## Publish the points

Write your review in chat as you normally would. Then publish one card per
point that is about a line in a file. Leave out points with no line, such as
one about the pull request description, and points about a deleted line,
which the diff cannot take a comment on.

For each point, find the line in the working tree file, not the diff's old
side: the line number `bb diff-comment add` will read. Take the hunk around it
from `git diff` so the card shows the code.

```json
{
  "title": "Review points for the diff",
  "summary": "Add a point to put it on the diff as a comment. You can post it to GitHub from there.",
  "dismissLabel": "Skip",
  "sections": [
    {
      "items": [
        {
          "id": "point-1",
          "title": "space.created_by is described two ways",
          "badges": [{ "label": "docs/adr/0002-keys.md:36" }],
          "summary": "The new section says it holds the creator's ID with no foreign key; this table still lists a foreign key.",
          "changes": [{ "label": "docs/adr/0002-keys.md", "patch": "@@ -30,8 +30,9 @@\n ..." }],
          "draftLabel": "Comment",
          "draft": "This table still lists `created_by` as a foreign key to `profile`, but the new Identifiers section says it has none. Which one is right?",
          "actions": [
            {
              "type": "message",
              "label": "Add comment",
              "primary": true,
              "text": "Add point-1 as a diff comment on docs/adr/0002-keys.md:36:\n\n{draft}"
            }
          ]
        }
      ]
    }
  ]
}
```

- Order the cards by importance, the same order as your review.
- The `draft` is the comment itself, written to the person who will read it on
  the diff or on GitHub: the pull request's author when you are reviewing
  someone else's work. State the problem and what would fix it. Do not repeat
  it in `summary`, which is your one-line gist for the row.
- `id`s are `point-1`, `point-2`, … in review order.

```bash
bb dynamic-ui publish --file /tmp/<thread>/review-points.json --key review-points
```

Then say in chat how many points are above the composer. Do not list them
again.

## When the user presses Add comment

You receive "Add point-N as a diff comment on <path:line>:" followed by the
text as the user left it. Add it with the text exactly as sent. Write it to a
file first, since it is markdown that quoting would mangle:

```bash
cat > /tmp/<thread>/point-N.md <<'COMMENT'
<the text, exactly as sent>
COMMENT
bb diff-comment add <path:line> --body-file /tmp/<thread>/point-N.md
```

Reply in chat with one line saying it is on the diff. If `add` fails, say why
in chat, such as a line that no longer exists after an edit, and ask which line
it belongs on.

Do not act on the point itself. Adding the comment is the whole request; the
user decides from the diff whether you should work on it.
