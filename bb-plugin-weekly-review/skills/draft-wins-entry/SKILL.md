---
name: draft-wins-entry
description: Use when the user wants their wins for a month drafted into their wins doc, such as "draft my wins for last month", "write up September's wins", or "update my wins doc". Drafts the month's wins from the weekly journal entries and the weeks Weekly Review gathered, shows one card per win, plus one for the month's pull request counts, for the user to accept, revise, or drop, and adds each accepted card to the doc.
---

# Draft a month's wins

The user keeps a Google Doc of wins: a heading per month, newest first, such
as `September 2026`, each with a bulleted list. This skill drafts one month's
list, last month unless the user names another, as one card per win. Nothing
reaches the doc until the user accepts a win. Then `bb weekly-review wins add`
puts it at the end of the month's section, adding the month's heading when
there is none.

## Where the wins come from

Start with the doc:

```sh
bb weekly-review wins [<YYYY-MM>]
```

It prints the month's wins as they stand, the doc's URL, the Mondays of the
month's weeks (those whose Friday falls in the month), and the newest earlier
month with wins. Leave out anything already in either list.

A week marked `not gathered` has to be gathered before its commands work:
`bb weekly-review sync <monday>`. Then, for each week:

| Command | What it gives you |
| --- | --- |
| `bb weekly-review entry <monday>` | The week's journal entry. Its `Wins/Highlights:` and `Done:` bullets are the main source: the user already chose what mattered that week and wrote it in their own words. |
| `bb weekly-review meetings <monday> --notes` | The week's meetings with the notes matched to each, for what someone said or decided |
| `bb weekly-review digest <monday>` | Hours, PRs, reviews, and issues, when a win needs a number or a link |

## Choosing the wins

A win is an outcome that went well, with something that shows it: a quote, a
decision someone made, a request to present, a thing that shipped and was
used. A busy week is not a win. Aim for four to eight across the month.

- Start from the journal's `Wins/Highlights:` bullets, then the `Done:`
  bullets whose outcome stands out.
- Merge bullets from different weeks about the same work into one win, with
  how it came out by the month's end.
- Rank them, most significant first.

## Writing each win

Keep it as short as a journal entry. The doc's earlier months run longer;
do not match their length.

- **One or two sentences.** Start with a past-tense verb, the "I" left off:
  "Shipped", "Handed off", "Got Hubber to". Say what happened and how it came
  out. Name people by first name.
- **At most two sub-bullets**, and only for a verbatim quote that shows the
  outcome, or a short group of related items. No sub-bullet that explains why
  the win matters; that reflection is the user's to add.
- **Keep the links the journal had** on the words that name the work. Add no
  new ones.
- `-` for bullets, two spaces per level of nesting. No em dashes.

```markdown
- Handed the widget sync release to Hubber, who tagged it on his own two weeks later.
  - Hubber: "I didn't need to ask anyone this time."
- Got the gadget migration approved after Octocat's review turned up no blockers.
```

## Show the drafts

Publish them above the composer with `bb impromptu-ui publish` (see the
`impromptu-ui` skill), one card per win in ranked order, so the user can
accept, revise, or drop each on its own:

```json
{
  "title": "Wins for September 2026",
  "sections": [{ "items": [{
    "id": "win-1",
    "title": "Handed off the widget sync release",
    "status": { "label": "Round 1", "tone": "warning" },
    "summary": "From the September 11 entry. Asks: did Hubber tag it before the 30th?",
    "history": [{ "text": "Round 1: drafted from the September 11 entry.", "at": "<iso time>" }],
    "draft": "- Handed the widget sync release to Hubber ...",
    "draftLabel": "Win",
    "evidence": [
      { "id": "handoff", "claim": "Handed the widget sync release to Hubber", "support": "full",
        "sources": [{ "quote": "Handed widget sync releases to Hubber.", "source": "Journal, September 11, 2026" }] }
    ],
    "note": { "placeholder": "What to change" },
    "actions": [
      { "type": "message", "label": "Accept", "text": "Accept win-1 for September 2026 as below:\n\n{draft}", "primary": true },
      { "type": "message", "label": "Revise", "text": "Revise win-1. {note}\n\n{draft}" },
      { "type": "message", "label": "Drop", "text": "Drop win-1." }
    ]
  }, "..."] }]
}
```

Put one more card first, for the month's pull request counts:

```sh
bb weekly-review wins stats <YYYY-MM>
```

It prints how many pull requests the user opened, had merged, and reviewed in
the month, in the configured repository, and ends with the line to use, such
as `Opened 12 pull requests, had 9 merged, and reviewed 30.` Use its numbers
as printed; do not count from the digests. The card has `"id": "stats"`,
`"title": "Pull requests"`, the line as its `draft` in underscores
(`_Opened 12 ..._`), `"draftLabel": "Line under the heading"`, a summary
saying it goes in italics directly under the month's heading, no evidence,
and the same three actions naming `stats`.

- **id** is `win-1`, `win-2`, and so on, in ranked order, and each action's
  text names it, so you know which card a message is about.
- **title** names the work in a few words.
- **summary** says which entries the win came from, and on its next lines
  anything you need the user to answer. Ask rather than invent: when a win
  needs an outcome you do not have, write what you know and ask.
- **draft** is the one win, with its sub-bullets.
- **evidence** backs the win with a verbatim quote from where it came from,
  usually the journal bullet, with its entry's heading as the source. Each
  entry needs `id`, `claim` copied exactly from the draft, `support` (`full`,
  `partial`, or `none`), and `sources`, each with `quote` and `source` and a
  `url` when there is one.

Say in chat only how many cards are above the composer, and any question in
one line.

## Rounds

Each message is about one card. Republish the whole view each time, with
every other card as it stands.

Revise brings back the user's note and the draft as they left it. Their edits
stand: start from their text, apply the note, and update that card with the
round number in `status` and a `history` entry for their note
(`"who": "user"`) and one for your round.

On Accept, write the accepted text to `/tmp/wins-<YYYY-MM>-<n>.md`, exactly
as the user left it, and add it to the doc:

```sh
bb weekly-review wins add <YYYY-MM> --file /tmp/wins-<YYYY-MM>-<n>.md
```

It goes after the month's last bullet with text, above any empty placeholder
bullets, with its links and levels kept, so the doc lists wins in the order
they are accepted. It prints the month's heading and a link to it. Then
republish that card with
`"status": { "label": "Added", "tone": "success", "complete": true }` and a
`link` action to that URL. `complete` goes inside `status`; without it the
card stays open and the header does not count it.

On Accept of the `stats` card, write the accepted line to
`/tmp/wins-<YYYY-MM>-stats.txt` and set it under the heading:

```sh
bb weekly-review wins summary <YYYY-MM> --file /tmp/wins-<YYYY-MM>-stats.txt
```

It puts the line in italics directly under the month's heading, with a blank
line after it, replacing an italic line already there, so accepting it again
updates the counts. Then mark the card complete the same way as a win.

On Drop, republish the card with
`"status": { "label": "Dropped", "complete": true }`, and change nothing in
the doc.

If the command fails, say why and leave the card open. Do not retry with
different text: a second attempt can add the win twice. Check with
`bb weekly-review wins <YYYY-MM>` first.

## What stays out

Anything about a person's role, career, job search, or performance, the
user's included, goes in only after the user says so.

Quote people only from their own words: a journal bullet that quotes them, a
PR or issue comment, a Slack message, or a meeting note that puts their words
in quotation marks.
