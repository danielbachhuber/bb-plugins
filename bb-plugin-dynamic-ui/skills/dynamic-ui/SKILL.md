---
name: dynamic-ui
description: Use when a skill or task produces a list of results the user will act on one by one (findings, issues to triage, PRs to merge, drafts to post) and `bb dynamic-ui` is available, to show them as a list with buttons above the thread's composer instead of as a list in chat.
---

# Dynamic UI

## Overview

`bb dynamic-ui publish` shows a view right above this thread's composer: one row per item with its title, first two badges, the first line of its summary, and its main button. Clicking a row opens the item in the side panel with its full summary, details, and every button. The user acts from the cards instead of typing replies. Use it when there are several items with a decision on each. For one answer or one question, chat is still right.

## Is it available?

```bash
bb dynamic-ui help >/dev/null 2>&1 && echo available
```

If it is not available, present the results in chat as you would have.

## Publish

Write the view to a file and publish it from this thread:

```bash
bb dynamic-ui publish --file /tmp/<name>/view.json [--key <name>]
```

The list appears above the composer by itself, and the side panel opens on the first open item, so put the item that most needs a decision first. Publishing again with the same key (default `default`) replaces the view and keeps what the user already did to each item, matched by item `id`. Use a different key for a second, separate view in the same thread. A validation error names the field to fix.

After publishing, say in chat how many items there are and that they are above the composer. Do not repeat the list in chat.

## The view file

```json
{
  "title": "Triage: acme/widgets milestone 4.2",
  "summary": "Markdown shown above the cards.",
  "sections": [
    {
      "title": "Ready to close",
      "items": [
        {
          "id": "issue-101",
          "title": "#101 Export widgets as CSV",
          "badges": [{ "label": "Done", "tone": "success" }],
          "summary": "Markdown, always shown.",
          "details": "Markdown behind a Details toggle.",
          "draft": "This is done. #140 added Export.",
          "draftLabel": "Comment to post",
          "actions": [
            { "type": "message", "label": "Post and close", "text": "Post this comment on #101, then close it:\n\n{draft}", "primary": true },
            { "type": "message", "label": "Post and keep open", "text": "Post this comment on #101 and leave it open:\n\n{draft}" },
            { "type": "command", "label": "Close only", "command": "gh issue close 101 --repo acme/widgets" },
            { "type": "thread", "label": "Fix in a new thread", "project": "widgets", "title": "Fix #101", "prompt": "..." },
            { "type": "link", "label": "Open #101", "url": "https://github.com/acme/widgets/issues/101" }
          ]
        }
      ]
    }
  ]
}
```

- `id` is unique in the view and stable across republishing: `issue-101`, `finding-3`.
- `tone` is `neutral` (default), `info`, `success`, `warning`, or `danger`.
- At most 6 actions per item. `primary: true` makes a button stand out; use it for the likely choice.
- `draft` is text the user can edit before it is sent: a comment to post, the task for a new thread. It is markdown: the opened item shows it once, rendered, under `draftLabel`, with a Raw toggle to edit the source. A `message` or `thread` button puts `{draft}` in its `text` or `prompt` where the draft goes, so several buttons (post and close, post and keep open) share one draft, and each sends its own instruction with the draft as the user left it. A button that uses `{draft}` opens the item from the list instead of sending. Commands cannot use `{draft}`. Do not repeat the draft in `summary` or `details`.
- The row above the composer shows only the first line of `summary` and the item's main button (the `primary` one, else the first that is not a link). Make the first line the gist, and mark the likely choice `primary`. Put evidence and drafts further down the summary or in `details`, which show when the item is opened.

| Action | What the button does |
|---|---|
| `message` | Sends `text` to this thread as if the user typed it. Use it when the work needs your judgment or context: posting a drafted comment, revising something. Write `text` so it names the item, because you will read it later with no other context. |
| `thread` | Starts a new thread in `project` (a name from `bb project list`, or `personal`) with `prompt` and `title`. The prompt must stand alone. |
| `command` | Runs `command` in the user's login shell, in `cwd` (absolute) or the directory `publish` ran in. The panel shows the command and asks before running, then shows the exit code and output. Use it for one self-contained step: `gh issue close`, `gh pr merge`. |
| `link` | Opens `url`. |

Every card also has Dismiss. Once one of a card's buttons goes through, the card is done and its other buttons are disabled (links stay usable), so each card should be one decision: offer "Post and close" and "Post and keep open" as alternatives, not "Post comment" then "Close issue" as steps. A command that fails leaves the card open to try again.

## Read back what the user did

```bash
bb dynamic-ui state [--key <name>]
```

Prints each item as `[open|done|dismissed] <id> <title>` with the last action and its result. Check it before a follow-up that depends on the user's choices, like a summary at the end of a batch.
