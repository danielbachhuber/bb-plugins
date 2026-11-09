---
name: clear-resolved-cards
description: Use when the user invokes /clear-resolved-cards, or asks to clear, tidy, or remove the Impromptu UI cards above the composer that have already been handled, such as "clear the done cards", "get rid of the resolved ones", or "only show what's still open".
---

# Clear resolved cards

Takes the cards the user has already acted on out of this thread's Impromptu UI views, so only the open ones stay above the composer.

## Run it

From the thread whose views to clear:

```bash
bb impromptu-ui clear-resolved            # every view in this thread
bb impromptu-ui clear-resolved --key <k>  # one view
```

It prints one line per view:

- A card is resolved once one of its buttons went through or the user dismissed it. A card with a `status` is resolved once you marked it `complete`.
- A view with some cards still open keeps only those, in its place above the composer. What the user did to each remaining card stays.
- A view with nothing left open is hidden, as `bb impromptu-ui hide` does.
- A view whose closing step is still open is left as it is, because its `{tally}` counts the other cards. Answer or dismiss the closing step first.
- Plain rows in a list view have nothing to decide, so they stay.

Tell the user in one line what was cleared and what is still open, from that output.

## After clearing

Publishing a view again with the cleared cards still in its file brings them back, marked done. When you publish the next round of a view you cleared, leave the cleared cards out of the file.

If the command says `Unknown command` or prints usage without `clear-resolved`, the installed plugin is older than this skill. Hide each view whose cards are all resolved with `bb impromptu-ui hide --key <k>`, checking `bb impromptu-ui list` and `state` first, and tell the user the rest needs the plugin rebuilt.
