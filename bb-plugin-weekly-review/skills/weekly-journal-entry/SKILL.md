---
name: weekly-journal-entry
description: Use when the user asks to draft, write, or fill in this week's work journal entry, or to turn the week Weekly Review gathered into an entry. Covers the entry's exact format (date heading, Done, Wins/Highlights, Reflections/Learnings, Next) and which details each bullet needs.
---

# Draft the week's journal entry

The user keeps a weekly work journal in a Google Doc, one dated entry per
week. Weekly Review has already gathered the week. Your job is to turn that
into an entry in the user's format, with the details that make each line worth
reading later. The format matters more than coverage: an entry that looks like
the previous ones and says less is better than one that says everything in a
different shape.

You never write to the doc. You produce the entry as markdown, and the user
pastes it in.

## Commands

| Command | What it gives you |
| --- | --- |
| `bb weekly-review list` | The gathered weeks, by Monday, with when each was last gathered |
| `bb weekly-review sync` | Gathers the current week now |
| `bb weekly-review digest <monday>` | The week: hours, PRs, reviews, issues, tasks, and time entries with their notes. PRs and issues appear as `#N`, without URLs. |
| `bb weekly-review meetings <monday> --notes` | Each named time entry, with the notes from the 1:1 doc, running meeting doc, or daily note matched to it, and that doc's URL |
| `bb weekly-review source list` | The repository the PRs and issues are in, among other things |
| `bb weekly-review entry <monday>` | The journal doc's entry for that week as it stands now, fresh from the doc |
| `bb weekly-review priorities <monday>` | The `Next:` bullets from the previous week's entry, and the workstreams linked to each |
| `bb weekly-review table <monday>` | Hours and activity per workstream |

## Procedure

1. **Pick the week.** The current week's Monday, or on a weekend the Monday of
   the week just past. If that is the current week and `list` shows it was
   last gathered before today, run `bb weekly-review sync` first. Leave an
   earlier week as it was gathered.
2. **Read the previous entry** with `bb weekly-review entry <last monday>`.
   Copy its heading level and section labels from what it prints, not from
   this file, in case the doc has changed.
3. **Read this week's entry** with `bb weekly-review entry <monday>`. If the
   user has started one, keep every bullet they wrote, word for word and in
   their order. Add to it; do not rewrite it.
4. **Read the evidence:** `digest`, `meetings --notes`, `priorities`, and
   `table` for the week. The meeting notes are where most of the entry comes
   from: what was discussed, decided, and asked of whom. The digest's
   "Coming up" section starts from today, so for a past week it is not the
   week after the entry.
5. **Draft** the entry in the format below.
6. **Write it to** `/tmp/weekly-journal-<monday>.md` and show it in the
   thread. Then list, separately and briefly:
   - the bullets you added to what the user had written
   - where each Next bullet came from
   - questions whose answers would make a bullet complete (see "Ask, don't
     invent")
7. **Revise** with the user until they are happy, rewriting the same file.
   Tell them to paste it into the doc with Edit > Paste from Markdown, which
   keeps the links and bullet levels.

## The format

```markdown
### October 9, 2026

Done:
- <bullet>
  - <sub-bullet>

Wins/Highlights:
- <bullet>

Reflections/Learnings:

Next:
- <bullet>
- People:
  - <Name>:
    - <action>
```

- **Heading:** the date of the week's Friday, spelled out as `Month D, YYYY`,
  at the level the previous entry uses.
- **Sections:** the four labels above, in that order, each a plain line ending
  in a colon, never a markdown heading. Keep a section's label even when it
  has no bullets, as the previous entries do.
- **Bullets:** `-` for bullets, two spaces per level of nesting. Use ` - `
  (a hyphen with a space each side) where a bullet pairs a name with a status.
  No em dashes.

### Done

Done is what the user did as a lead, not a list of their output. The bullets
are the conversations they had, the guidance and feedback they gave, what they
asked of someone, what they handed off or took over, and the few pieces of
work that mattered beyond the code: a strategy doc finally submitted, a fix
for a problem a partner hit. Aim for five to eight bullets, the most
significant first.

Pull requests and code review are evidence, not bullets. Mention a PR when it
is the thing the bullet is about. Never list merged PRs one per line, and
never count reviews ("Reviewed 69 pull requests"); the hours are on the
Weekly Review page already.

Each bullet:

- **Starts with a past-tense verb, the "I" left off:** "Shipped", "Paired
  with", "Took over", "Finally wrote up", "Reviewed". Use "I"
  inside the sentence when it reads better: "I asked Hubber to produce these
  by Tuesday."
- **Links the words that name the work,** not a bare URL and not "here":
  `Finally wrote up [the widget caching design](<pr url>)`. A
  secondary issue or PR goes in parentheses as its number:
  `([#123](<issue url>))`. A PR or issue URL is
  `https://github.com/<repo>/issues/<N>`, with the repository from
  `source list`; GitHub sends an issue URL on to the PR when the number is a
  PR. A doc's URL comes from `meetings --notes`. Leave anything else
  unlinked rather than guessing a URL.
- **Says who, why, what, and how it came out.** Name people by first name.
  Give the trigger ("after Octocat found the export dropping rows"), what
  the user did, and the result. One or two sentences; longer only when the
  story needs it.
- **Uses sub-bullets for structure inside one piece of work:**
  - a group of similar items, each `[<linked name>](<url>) - <status sentence>.`
  - the questions or points the user gave someone, as written
  - what someone said back, quoted verbatim in quotation marks
  - `Learnings:` with its own nested bullets, when one piece of work taught
    something specific
  - `AI-Native SDLC: <what the agent did and why it helped>`, when the work
    used AI in a way worth showing others, such as an agent writing the
    test fixtures so a reviewer could run the change without setup. Only when
    the evidence shows it.

Group several small things of one kind into one bullet with sub-bullets
("Checked in with each team lead on their plan:"), rather than a bullet each.
Leave out routine overhead such as email, one-off code reviews, and recurring
meetings, unless something came of them.

### Wins/Highlights

What went well, and why it mattered. Each bullet names the outcome and, where
there is one, the reaction that shows it: a quote, a decision someone made, a
request to present. How a meeting felt is the user's to say; you can propose a candidate and the evidence for it, and ask.

### Reflections/Learnings

The user's own thinking. Leave it empty unless they told you something in
this conversation to put there. Never write a reflection for them.

### Next

Short imperative bullets for next week: "Dive into", "Help Octocat prepare",
"Follow up with". Base them on:

- last week's priorities (`priorities`) that are not done yet
- open threads from this week's Done bullets
- what `digest` shows as coming up or overdue

End with `People:`. When there is one action, or one that covers several
people ("Check in with Octocat and Hubber"), put it on one line under
`People:`. Otherwise nest by name, each with what the user means to do for or
with that person:

```markdown
- People:
  - Octocat:
    - Check in on Octocat's proposal
  - Hubber:
    - Help Hubber identify his wins for the month
```

The user decides the priorities. Propose them and say which source each came
from.

## Ask, don't invent

The digest says what happened, not how it went. When a bullet needs something
the evidence does not have, such as whether a meeting reached a decision, how
someone responded, or why the user took something on, write the bullet with
what you know and ask. "Checked in but haven't heard back" is a fine status
when it is true. An invented outcome in a journal is worse than a short
bullet.

Anything about a person's role, career, job search, or performance, the
user's included, goes in only after the user says so, whether it came from a
1:1 doc, a task, or Slack. Write a neutral placeholder ("Discussed my
role with Octocat") and ask.

Quote people only from their own words: a PR or issue comment, a Slack
message, or a meeting note that puts their words in quotation marks. Most
meeting notes paraphrase, so write those without quotation marks. Link the quote's source when it has a URL.
