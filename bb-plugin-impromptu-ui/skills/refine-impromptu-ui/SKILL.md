---
name: refine-impromptu-ui
description: Use when Impromptu UI fell short in this thread and the user wants it improved, such as "impromptu UI should have shown this", "why didn't that show above the composer", "the view can't do what I need", "file feedback on impromptu UI", or "refine impromptu UI". Works out what went wrong, offers alternatives, and files an anonymized issue on danielbachhuber/bb-plugins.
---

# Refine Impromptu UI

When Impromptu UI did not show up where it should have, or showed up but could
not do what the work needed, turn that into an issue the plugin's maintainer
can act on. The issue describes the kind of work and what would have helped,
never the user's own data, because the repository is public.

## 1. Work out what went wrong

Start from what you already know in this thread: the task, whether you
published a view, and what the user said about it. Read back any view you
published:

```bash
bb impromptu-ui list
bb impromptu-ui state [--key <name>]
```

Place the problem in one of these:

| What happened | Example |
|---|---|
| **Did not fire** | Results that the user acted on one by one went into chat as a numbered list, because the skill's description did not match the task. |
| **Could not express it** | A view went up, but the work needed something it has no field for: a button type, a layout, a way to group or sort items. |
| **Worked badly** | A view went up and did the job, but something about it got in the way: too much text on a row, the side panel opening at the wrong time, a button that did the wrong thing. |
| **Broke** | An error from `publish`, a view that did not render, a button that failed. |

If what the user said leaves more than one of these possible, ask one
question to settle it, and offer your best guess as the first answer. Do not
ask about what you can see in the thread.

Then read the current guide, `skills/impromptu-ui/SKILL.md` (bb gives it to
this thread as the `impromptu-ui` skill), for the part that covers the
problem. Some problems can already be solved today, with a field you did not
use or a way of arranging the cards, such as one card that acts on a whole
group. Offer to republish that way now. If the guide does not mention the
workaround, keep going: a change to the guide is one of the alternatives.

## 2. Offer alternatives

Come up with two to four ways the plugin could change, each one specific
enough to build. Draw them from different places rather than offering one
idea three ways:

- **The guide**: a change to the skill's description, so it fires for this
  kind of task, or to its instructions, so an agent picks the right layout or
  field.
- **The view file**: a new field, button type, or layout.
- **The panel or the list**: a change to how something already supported
  looks or behaves.

For each, say what it would change for the task at hand, and what it costs:
another field every agent has to learn, a layout that suits only this kind of
work, a change in behavior that existing views rely on.

Show them as a view, one card per alternative, unless Impromptu UI is the
thing that broke. Publish it under its own key, so it does not replace the
view the user is still working in:

```bash
bb impromptu-ui publish --file /tmp/refine-impromptu-ui/view.json --key refine-impromptu-ui
```

Put the cards in one section titled **Ways to change it**, with
`"dismissLabel": "Not this"`. Give each card one button,
`{ "type": "message", "label": "File this one", "text": "File the Impromptu UI issue for \"<card title>\"" }`,
with the card's title copied into `text`. Put the one you would recommend
first. If Impromptu UI is not available or is what broke, list them in chat
instead and ask which to file.

The user may press **File this one** on more than one card. File each as its
own issue, and link each to the others in its list of alternatives.

## 3. Check for an existing issue

```bash
gh issue list -R danielbachhuber/bb-plugins --state all --search "<keywords>" --limit 10
```

Try two or three phrasings of the change itself, such as "select several
cards" and "bulk action", with and without "impromptu". If an open issue asks for the same change, offer
to add this use case to it as a comment instead of filing a new one. If a
closed one does, read why it was closed before going on.

## 4. Draft the issue, anonymized

Write the draft to a markdown file and show it to the user. Nothing is posted
until they confirm.

**Anonymize everything.** The issue is public, and it should read the same
whoever filed it:

- No repository, organization, project, board, team, or person names. Use
  `acme/widgets`, `acme/gadgets`, `octocat`, `hubber`, or `Acme Board`.
- No thread ids, file paths under a home directory, internal URLs, or email
  addresses.
- No text copied from the thread, the user's files, or their issues and pull
  requests. Describe the work in general terms: "a skill that triages the
  open issues in a milestone", not the issues themselves. A count or a kind
  of thing, such as "six patch-level bumps", is fine; a title, number, or
  quote is not.
- An example view file is useful, but write its titles, summaries, and
  numbers from scratch. Swapping the names in a real one and lightly
  rewording it still identifies it.

**Shape.** No headings. A title that states the change, such as "Let a
`command` button take the draft in a card view". Then:

1. A paragraph on the kind of work and what Impromptu UI did with it.
2. A paragraph on what would have helped, followed by an invented example
   view file or a sketch of the screen if it makes the change clearer.
3. The other alternatives considered, a line each, then why the user picked
   this one. If you recommended a different one, say which and why.
4. One line: `Versions: bb <x>, impromptu-ui <y>`, from `bb --version` and
   `bb plugin list | grep impromptu-ui`.
5. A `**Done is:**` list of two to four checks someone could run to see the
   change is finished.

Before showing the draft, read it once more against the anonymizing rules,
looking for anything that came from the thread rather than from you.

## 5. File it

Once the user confirms:

```bash
gh issue create -R danielbachhuber/bb-plugins \
  --title "<title>" --body-file <draft.md> --label <enhancement|bug>
```

Use `bug` for **Broke**, `enhancement` for the rest. Reply with the issue's
title and a link to it, then delete the draft file. Take down the
alternatives view once every pick is filed:

```bash
bb impromptu-ui hide --key refine-impromptu-ui
```

If `gh` is not installed or not signed in, give the user a link that opens
the form already filled in instead:

```
https://github.com/danielbachhuber/bb-plugins/issues/new?title=<url-encoded title>&body=<url-encoded body>&labels=<label>
```
