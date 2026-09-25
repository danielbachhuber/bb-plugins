---
name: dynamic-ui
description: Use when `bb dynamic-ui` is available and either a skill or task produces a list of results the user will act on one by one (findings, issues to triage, PRs to merge, drafts to post), or you are proposing two or more visual directions for a UI, to show screenshots of each with the original first for the user to pick from and comment on. Shows either above the thread's composer instead of in chat.
---

# Dynamic UI

## Overview

`bb dynamic-ui publish` shows a view right above this thread's composer: one row per item with its title, first two badges, the first line of its summary, and a Review button. Nothing runs from the list: the row and its button open the item in the side panel, with its full summary, details, and every button. The user acts from the cards instead of typing replies. Use it when there are several items with a decision on each. For one answer or one question, chat is still right.

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

The list appears above the composer by itself, and the side panel opens on the first open item, so put the item that most needs a decision first. Publishing again with the same key (default `default`) replaces the view and keeps what the user already did to each item, matched by item `id`. Keep an item in the file after the user has acted on it: its done state and result banner show only while the item is still in the view, and dropping it makes a handled item vanish instead of reading as done. Use a different key for a second, separate view in the same thread. A validation error names the field to fix.

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
          "url": "https://github.com/acme/widgets/issues/101",
          "badges": [{ "label": "Done", "tone": "success" }],
          "summary": "Markdown, always shown.",
          "details": "Markdown behind a Details toggle.",
          "draft": "This is done. #140 added Export.",
          "draftLabel": "Comment to post",
          "actions": [
            { "type": "message", "label": "Post and close", "text": "Post this comment on #101, then close it:\n\n{draft}", "primary": true },
            { "type": "message", "label": "Post", "text": "Post this comment on #101 and leave it open:\n\n{draft}" },
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
- `url` is what the item is about on the web (the issue, the PR, the review comment's `html_url`). The opened item's title links to it, so set it whenever there is one; a separate `link` button for the same page is then unnecessary.
- `tone` is `neutral` (default), `info`, `success`, `warning`, or `danger`.
- At most 6 actions per item. `primary: true` makes a button stand out; use it for the likely choice.
- `draft` is text the user can edit before it is sent: a comment to post, the task for a new thread. It is markdown: the opened item shows it once, rendered, under `draftLabel`, with a Raw toggle to edit the source. A `message` or `thread` button puts `{draft}` in its `text` or `prompt` where the draft goes, so several buttons ("Post and close" and "Post") share one draft, and each sends its own instruction with the draft as the user left it. Commands cannot use `{draft}`. Do not repeat the draft in `summary` or `details`.
- The row above the composer shows only the title, two badges, and the first line of `summary`. Make the first line the gist, and mark the likely choice `primary` so it stands out in the opened item. Put evidence and drafts further down the summary or in `details`.

| Action | What the button does |
|---|---|
| `message` | Sends `text` to this thread as if the user typed it. Use it when the work needs your judgment or context: posting a drafted comment, revising something. Write `text` so it names the item, because you will read it later with no other context. |
| `thread` | Starts a new thread in `project` (a name from `bb project list`, or `personal`) with `prompt` and `title`. The prompt must stand alone. |
| `command` | Runs `command` in the user's login shell, in `cwd` (absolute) or the directory `publish` ran in. The panel shows the command and asks before running, then shows the exit code and output. Use it for one self-contained step: `gh issue close`, `gh pr merge`. |
| `link` | Opens `url`. |

An item with `variations` is a visual review instead: see below.

Every card also has Dismiss, and Start thread, which opens a new thread seeded with the card so the user can dig into it; do not add a `thread` button that only does that. Once one of a card's buttons goes through, the card is done and its other buttons are disabled (links stay usable), so each card should be one decision: offer "Post and close" and "Post" as alternatives, not "Post comment" then "Close issue" as steps. Label each button with only what it does: "Post" already means the issue stays open, so leave off "and keep open", and leave off prefixes like "Instead:". A command that fails leaves the card open to try again.

## Visual review

When you would otherwise describe two or more ways a piece of UI could look ("how might we improve this?"), show them instead. Give an item `variations` in place of `actions`, or alongside a link:

```json
{
  "id": "review-rows-1",
  "title": "Task rows: 2 directions",
  "summary": "What reads as wrong now, in a sentence.",
  "variations": [
    { "label": "Original", "description": "As it is now.", "image": "/tmp/review/original.png" },
    { "label": "A. Sections", "description": "Overdue / Today headings, grey icons.", "image": "/tmp/review/a.png" },
    { "label": "B. Dates right", "description": "Sections, plus a short date on the right.", "image": "/tmp/review/b.png" }
  ]
}
```

- The first variation is always the original, as it is now. Then 1 to 5 alternatives, labelled with a letter and a few words.
- Each variation is a different design, because the user picks one of them. To show one design in several states (another tab selected, a filter on, a menu open), put the states side by side in that design's one image, and say in its description what each shows. Never make the states separate variations: "C. Widgets tab", "C. Gadgets tab", and "C. Gadgets, filtered" ask the user to pick between screens of the same thing. A round with one direction left is the original and that direction, two variations.
- Take every image the same way: the same story or screen, the same data, width, and crop, so only the design differs. Build each alternative as a story or behind a flag and screenshot it; do not draw mockups by hand. PNG, JPEG, WebP, or GIF, up to 8 MB each.
- Capture the element itself (Playwright's `locator.screenshot()`) rather than cropping a full-page capture afterwards. If you must crop, use `magick in.png -crop <w>x<h>+0+0 +repage out.png`, not `sips`: `sips -c` crops around the centre, and its `--cropOffset` does not pin the crop to the top-left, so the left and top edges are lost. Read each image back before publishing to check nothing is cut off.
- `publish` copies the images, so moving or deleting the files afterwards is fine.
- The user picks one (or none), notes on any, and presses Send feedback. You receive one message: `Visual review feedback on "<title>":`, the pick, and each note. Build what it says, then publish the next round as a new item with a new `id` (`review-rows-2`) if another round is needed. A sent review cannot be sent again.

## Read back what the user did

```bash
bb dynamic-ui state [--key <name>]
```

Prints each item as `[open|done|dismissed] <id> <title>` with the last action and its result. Check it before a follow-up that depends on the user's choices, like a summary at the end of a batch.
