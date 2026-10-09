---
name: weekly-journal-entry
description: Use when the user wants to capture one piece of work as an entry in their weekly work journal, such as at the end of a thread ("add this to my journal", "write this up for my weekly entry"), or in a thread started to document what they did on a priority or project. Drafts one bullet in the journal's format, shows it for the user to edit or give feedback on, and revises until they accept it.
---

# Capture a journal entry

The user keeps a weekly work journal in a Google Doc. Each week has sections
(`Done:`, `Wins/Highlights:`, `Reflections/Learnings:`, `Next:`) of bullets.
This skill writes **one** of those bullets, with its sub-bullets, about one
piece of work: what this thread did, or what the user did on the thing the
thread was started for. The format matters more than anything else here.

Nothing reaches the doc until the user accepts the draft. Then
`bb weekly-review entry add` puts it at the end of its section in the week's
entry.

## Where the entry comes from

- **At the end of a thread:** the thread itself is the main source. Read back
  over it for what was done, why, who asked or was involved, and how it came
  out: the PR or issue it produced, the problem it fixed, what the user
  decided.
- **In a thread started to document something,** such as from a priority on
  the Now page: the thread's first message names it. Gather the evidence
  below, then ask the user what you cannot tell from it, in one short
  message, before drafting.

Then fill in from Weekly Review, which has the week already gathered:

| Command | What it gives you |
| --- | --- |
| `bb weekly-review entry <monday>` | The week's entry as it stands in the doc. Read it first: the user may have written about this already, and its bullets show the voice to match. |
| `bb weekly-review meetings <monday> --notes` | The week's named time entries, each with the notes from the 1:1 doc, meeting doc, or daily note matched to it, and that doc's URL |
| `bb weekly-review digest <monday>` | Hours, PRs, reviews, issues, tasks, and time entries with their notes. PRs and issues appear as `#N`, without URLs. |
| `bb weekly-review priorities <monday>` | Last week's `Next:` bullets, which is what this week was meant to be about |
| `bb weekly-review source list` | The repository the PRs and issues are in |

`<monday>` is this week's Monday, or on a weekend the Monday just past. Read
only what bears on this one piece of work.

## Drafting the bullet

Most entries go under `Done:`. One goes under `Wins/Highlights:` when its
point is an outcome that went well, and you are proposing that, so say so.
Never draft `Reflections/Learnings:`; that is the user's own thinking.

If the week's entry already has a bullet about this work, propose a change
to that bullet rather than a second one.

### Done

Done is what the user did as a lead: a conversation, guidance or feedback
given, something asked of someone, work handed off or taken over, a doc or
fix that mattered beyond the code. A PR is evidence, and the bullet names it
when it is the thing the bullet is about.

- **Start with a past-tense verb, the "I" left off:** "Shipped", "Paired
  with", "Took over", "Finally wrote up", "Reviewed". Use "I" inside the
  sentence when it reads better: "I asked Hubber to produce these by
  Tuesday."
- **Link the words that name the work,** not a bare URL and not "here":
  `Finally wrote up [the widget caching design](<pr url>)`. A secondary issue
  or PR goes in parentheses as its number: `([#123](<issue url>))`. A PR or
  issue URL is `https://github.com/<repo>/issues/<N>`, with the repository
  from `source list`; GitHub sends an issue URL on to the PR when the number
  is a PR. A doc's URL comes from `meetings --notes` or the thread. Leave
  anything else unlinked rather than guessing.
- **Say who, why, what, and how it came out.** Name people by first name.
  Give the trigger ("after Octocat found the export dropping rows"), what
  the user did, and the result. One or two sentences; longer only when the
  story needs it.
- **Use sub-bullets for structure inside the one piece of work:**
  - a group of similar items, each `[<linked name>](<url>) - <status sentence>.`
  - the questions or points the user gave someone, as written
  - what someone said back, quoted verbatim in quotation marks
  - `Learnings:` with its own nested bullets, when the work taught something
    specific
  - `AI-Native SDLC: <what the agent did and why it helped>`, when the work
    used AI in a way worth showing others, such as an agent writing the test
    fixtures so a reviewer could run the change without setup. A thread's own
    work often qualifies; say what the agent did that a person would
    otherwise have done.

### Wins/Highlights

Name the outcome and why it mattered, with what shows it: a quote, a
decision someone made, a request to present.

### Form

`-` for bullets, two spaces per level of nesting. ` - ` (a hyphen with a space
each side) between a name and its status. No em dashes.

```markdown
- Took over [the export fix](https://github.com/acme/widgets/issues/412) from Hubber after Octocat found it dropping rows. I reworked the script so it could not overwrite good data, and ran it.
  - AI-Native SDLC: I had Claude capture before-and-after screenshots of the report, so Octocat could check the result by eye instead of re-running queries.
```

## Show the draft

Publish it as a card above the composer with `bb dynamic-ui publish` (see the
`dynamic-ui` skill), so the user can edit it in place or tell you what to
change. One item, worked in rounds:

```json
{
  "title": "Journal entry",
  "sections": [{ "items": [{
    "id": "entry",
    "title": "Done: Took over the export fix",
    "status": { "label": "Round 1", "tone": "warning" },
    "summary": "For the week of Oct 5. Asks: did Octocat confirm the numbers?",
    "history": [{ "text": "Round 1: drafted from this thread and the 1:1 notes.", "at": "<iso time>" }],
    "draft": "- Took over [the export fix](...) ...",
    "draftLabel": "Entry",
    "evidence": [
      { "id": "took-over", "claim": "Took over [the export fix](...) from Hubber", "support": "full",
        "sources": [{ "quote": "Can you take the export fix? I'm out tomorrow.", "source": "Slack, Oct 6", "url": "https://..." }] }
    ],
    "note": { "placeholder": "What to change" },
    "actions": [
      { "type": "message", "label": "Accept", "text": "Accept the journal entry as below:\n\n{draft}", "primary": true },
      { "type": "message", "label": "Revise", "text": "Revise the journal entry. {note}\n\n{draft}" }
    ]
  }] }]
}
```

- **title** names the section and the work, so the row above the composer
  reads as what it is.
- **summary** says which week, and on its next lines anything you need the
  user to answer. Ask rather than invent: the digest says what happened, not
  how it went, so when the bullet needs an outcome, a reaction, or a reason
  you do not have, write what you know and ask.
- **evidence** backs each claim in the draft with a verbatim quote from where
  it came from: a line of this thread, a meeting note, a PR's title or
  comment. A claim the user told you directly can cite them. Each entry needs
  `id`, `claim` copied exactly from the draft, `support` (`full`, `partial`,
  or `none`), and `sources`, each with `quote` and `source` and a `url` when
  there is one. The `dynamic-ui` skill has the rest.
- **changes**, when the doc already has a bullet about this: give
  `[{ "label": "Done", "before": "<the existing bullet>" }]`, so the card
  shows the draft against it.

Say in chat only that the draft is above the composer, and any question in
one line.

## Rounds

Each Revise brings back the user's note and the draft as they left it. A
placeholder they typed, such as `<one>` or `TBD`, is for you to fill in. Their
edits stand: start from their text, apply the note, and publish again under
the same `id` with the round number in `status` and a `history` entry for
their note (`"who": "user"`) and one for your round.

On Accept, write the accepted text to `/tmp/journal-entry-<monday>.md`, exactly
as the user left it, and add it to the doc:

```sh
bb weekly-review entry add <monday> --section "Done" --file /tmp/journal-entry-<monday>.md
```

It goes at the end of that section in the week's entry, as bullets at the
levels written, with the links kept. When the week has no entry yet, it adds
one first, headed with the week's Friday and with the section labels of the
entry below it. It prints the entry's heading and a link to it.

Then republish the card with `"complete": true`, the status `Added`, and a
`link` action to the URL it printed, and say in chat where it went.

If the command fails, say why and leave the card open. Do not retry with
different text: the doc is the user's, and a second attempt can add the
bullet twice. Check with `bb weekly-review entry <monday>` first.

## What stays out

Anything about a person's role, career, job search, or performance, the
user's included, goes in only after the user says so. Write a neutral
placeholder ("Discussed my role with Octocat") and ask.

Quote people only from their own words: a PR or issue comment, a Slack
message, or a meeting note that puts their words in quotation marks. Most
meeting notes paraphrase, so write those without quotation marks.
