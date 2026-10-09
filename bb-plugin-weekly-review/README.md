# Weekly Review

A BB nav panel that puts one week of work on one page, so the weekly journal
entry can be written from evidence rather than from memory.

It gathers what happened, and its `weekly-journal-entry` skill writes entries
into the journal doc one at a time, once you accept each one.

The week is gathered at 7am and 1pm on weekdays, so the page is already current
when you open it. **Sync** gathers it now rather than at the next run.

## The page

Sources split into two kinds, and the page follows.

**The week spine** — everything with a date, one section per day: that day's
time entries, pull requests opened and merged, reviews, issues filed, and daily
notes. A pull request opened Monday and merged Thursday appears on both days;
opened and merged the same day collapses to one row.

**Conversations** — the week's Slack threads, grouped by the day each one
started.

**Where the time went** — the body of the page, opening with every theme and
its hours on one list, then each theme in full. Grouped by what the work was
about rather than by how it was booked. One-on-ones, Open Source Roadmap,
Phase 3 review, Code review, and an Everything else for the tail. Under each
theme the days it happened on, and under each day how long, what kind of time
it was booked as, what it was, and the notes taken in it.

The grouping is read out of the entries themselves and needs no model. An entry
naming an issue takes that item's title; one reading `<something> w/ <person>`
takes the something, unless that something is just a word for a meeting, in
which case it is a one-on-one. Themes sharing a run of significant words then
merge, which is what puts "Architecture Talk", "Architecture Talk Prep" and
"Prep Architecture Talk" together across three different Harvest categories.
Grouped hours and the tail add up to the week's total exactly.

**Coming up** — last on the page, and the one part of it that looks forward:
the calendar and the tasks due, from tomorrow through the end of next week,
grouped by day, with anything already overdue at the top. A day with nothing on
it gets no heading. Today is not in it: today is already on the rest of the
page, and a meeting that happened this morning is not something to plan around.

## Priorities

The Priorities section lists the bullets under `Next:` in the previous week's
entry, which is what you said this week would be about. A bullet nested under
another stays with it, at its own level, so "People:" with a name beneath it
and "Check in with …" beneath that is one priority.

Link each priority to the workstreams it is about. Each link shows that
workstream's hours and activity this week. A priority with no link says so,
and so does a linked one that got no time. The page suggests a link when a
workstream's name or one of its title phrases appears in the bullet.

Linked workstreams lead the table as **Planned**, the rest follow as
**Unplanned**, and a linked workstream with no activity still gets its empty
row, which is the gap the page is there to show.

The priorities come from the same copy of the journal doc as this week's
entry, so they cost no extra request (see below).

### On the Now page

When the [Now](../bb-plugin-now) plugin is installed, Weekly Review writes the
week's priorities into it, where they show in a column beside Now's list. Each
goes with the hours its linked workstreams have had this week: none for a
priority with no link, and none either when its workstreams had activity but
no hours, so Now does not report it as getting no time. It writes after each
gather, when a fresh read of the journal finds a changed entry, and after any
change on this page, such as linking a priority. Each write is one RPC call to
Now on this machine.

A priority checked off on the Now page shows here struck through, marked
"Done in Now". Opening the page asks Now once which are checked. When Now is
not installed or the call fails, the page shows the priorities without done
marks and logs one warning.

## Workstreams

A workstream is a piece of work you are spending time on, such as a feature,
a launch, or code review. The Workstreams table, below the week's totals, has
one row per workstream and one column per weekday, plus Saturday and Sunday
when something happened on them. Each cell shows the hours logged and how many
PRs, reviews, issues, and completed tasks landed there. Total and Share close
the row. Anything no rule matched is in Unsorted, so the rows always add up to
the week's hours.

Only activity counts: time entries, PRs opened or merged, reviews, issues
filed, and completed tasks. Completed tasks have no day, because `td` reports
none, so they count in Total only.

Rules decide where activity goes, and they carry over from week to week:

| Rule | Matches |
|---|---|
| Issue or PR number | that PR or issue, and a time entry whose note starts `#N` |
| Harvest task | a time entry booked to that task |
| Label | a Todoist task or issue with that label |
| Title contains | any activity whose title contains the phrase |

When several rules match, a hand assignment wins, then a number, a Harvest
task, a label, and the longest phrase.

Select a cell, or a row's name, to see what is in it and which rule put it
there. Each activity has a picker to move it to another workstream by hand
(or keep it Unsorted), and a **Make a rule** form seeded from the activity.
The form says how many activities the rule would catch across every gathered
week before you save it.

A week's workstreams are the ones with activity. Add one with no activity yet
so its empty row shows, or hide one, which moves its activity to Unsorted.

**Suggest rules** starts an agent thread that reads what is unsorted and the
existing workstreams, and proposes rules for them with
`bb weekly-review rule propose`. Each proposal appears on the page with its
reason and what it would catch, and becomes a rule only when you accept it.
Accepting one that names a new workstream creates the workstream. The agent
uses the same provider as the other agent steps, and its prompt is editable in
the plugin's settings. It never runs on a schedule.

Until the rules cover a week, the page suggests the week's themes as
workstreams. Accepting one creates it with a rule for its issue numbers, its
Harvest task, or its title, and sorts this week's entries for it.

Everything on the page has a CLI equivalent, listed under CLI below. The
digest an agent reads includes the table once a workstream exists.

Opening the page makes no API calls for any of this: the table is built from
the gathered week in the database.

## Meeting notes

Two sources sit under a meeting: the day's own notes, and the reference doc
that covers it. Both can appear on the same row.

Daily notes are MCP-only, so a script cannot reach them. **Collect notes**
sends an agent, which pulls each day in the range, splits it into one entry per
meeting — a daily note is already written that way, a top-level bullet per
conversation — and records them with `bb weekly-review notes`.

Matching is deterministic first. `Open Source Roadmap w/ Marius` and
`Open Source Roadmap w/ Marius Scheffel` are the same conversation and the page
sees that itself. When the two records disagree entirely — logged as
`Phase 3 review`, written up as `PSI deadline check-in` — the agent sets
`meeting` to the time entry verbatim, and that wins over any rule.
`bb weekly-review meetings <monday>` prints the week's entries and flags the
ones nothing has matched, which is the list the agent is sent to resolve.
With `--notes` it also prints the notes matched to each entry.

The reference docs are mostly running 1:1 documents — one per person, newest
entry first, each under a `## August 31st` heading. A time entry reading
`1:1 w/ Rob` on that day is that meeting, so its section is what was discussed,
and the page shows it inline.

A recurring meeting's running notes doc works the same way. Add it with a
label the time entries use, such as `Design review` for entries reading
`Design review` or `Design review prep`, and each entry gets that day's
section. Headings may lead with the weekday, as in
`## Wednesday, September 30th, 2026`.

Two rules decide the match, both strict. A doc whose label appears in the entry
is that meeting. Otherwise a doc about one person matches an entry naming that
person — but only when the entry reads like a meeting. `1:1 w/ Brendan` and
`Review Brendan's project plan` both name Brendan; attaching a 1:1's notes to
the second would read as a record of a conversation that never happened.

Notes are routinely written up a day either side of the meeting, so the nearest
dated section within three days wins. The doc and its heading are shown with
the text rather than hidden behind it, so a near match reads as what it is.

## Sources

| Source | How | Day-attributable |
|---|---|---|
| Harvest time entries | `hrvst` | yes, `spent_date` |
| PRs authored | `gh search prs` (created ∪ merged) | yes |
| PRs reviewed | `gh search prs --reviewed-by` | approximately, via `updatedAt` |
| Issues created | `gh search issues` | yes |
| Issues assigned | `gh search issues --assignee` | no — current snapshot |
| Todoist completed | `td completed list` | no |
| Todoist incomplete | `td task list` | no — overdue and near-term reach the digest |
| Reference docs | a script that prints a Google Doc as text | no |
| Calendar | `gws calendar events list`, primary calendar | yes — and forward, not back |
| Slack | agent step, over MCP | yes |
| Daily notes | agent step, over MCP | yes |

## Gathering

A schedule gathers the current week at 7am and 1pm, Monday to Friday, in the
server's local time. Only the scripted sources run on it: Harvest, GitHub,
Todoist, the calendar, and the reference docs. Slack and daily notes each start
an agent thread, so they still run only from their buttons.

What each scheduled run does:

- Gathers the current week, Monday through today.
- On Monday's first run, first gathers the previous week once more, Monday
  through Sunday, so time logged after Friday's 1pm run is included.
- Fetches the reference docs only on the day's first run. Each doc is a
  separate Google request, and they rarely change within a day.

Each gather of a week makes one Harvest request, five GitHub searches (PRs
created, PRs merged, reviews, issues created, issues assigned), two Todoist
requests, and one calendar request per page of results, usually one. A run
that fetches docs adds one request per reference doc, plus one for the journal
doc. Monday's first run makes
these calls twice, once for each week.

Sync runs the same gather, with the docs. If a scheduled run and a Sync
overlap on the same week, the second waits for the first and shares
its result instead of running every CLI again.

The title bar says when the week was gathered, when the next run is, and which
sources failed on their latest run. When one has failed, a banner across the
top of the page names it, prints its error, and says how old the data shown
for it is, or that there is none yet this week.

Change the times with the `gatherCron` setting, a five-field cron expression:

```sh
bb plugin config weekly-review set gatherCron "0 7,13 * * 1-5"
bb plugin reload weekly-review
```

bb registers the schedule when the plugin loads, so a new expression applies
after the reload. One that does not parse falls back to the default, with a
warning in the log. `bb plugin list` shows the schedule and its next run.

## Where things are kept

**Sources — the database.** What a week is gathered from identifies a person:
a repository, a username, a Harvest project, a list of 1:1 documents. It lives
in the plugin's own SQLite database, which bb keeps under
`<dataDir>/plugins/weekly-review/` — never committed, and deleted with the
plugin. Edit it on this plugin's page in Tools, or from the CLI:

```sh
bb weekly-review source list
bb weekly-review source set repo octocat/acme-widgets
bb weekly-review source set author octocat
bb weekly-review source set harvestProjectId 12345678
bb weekly-review source add-doc 1AbCdEf... Annual goals
bb weekly-review source remove-doc "Annual goals"
```

**Weeks — the database too.** Each gathered week is stored as rows in the same
database (see Storage below). An agent reads a week with
`bb weekly-review digest <monday>`.

**Settings — paths and the schedule.** `bb plugin config weekly-review` holds
where `gh`, `hrvst`, `td`, `gws`, and the Google Doc script are, plus the gather
schedule. Neither is a fact about anyone, so both are safe as declarative
settings. The calendar needs no configuration beyond the path: it reads
`primary`, which identifies nobody.

## The entry, and feedback on it

The weekly entry is written in a Google Doc. This plugin reads that document,
and writes to it only to add an entry you have accepted (see Capturing an
entry, below). The feedback step never writes to it.

Set the doc with `bb weekly-review source set journalDocId <id>`. The entry for
a week is the last dated section falling inside it — the doc uses the same
`## September 4, 2026` headings the 1:1 documents do.

The page never waits on Google for it. It shows the stored copy of the doc at
once and reads the doc again in the background, at most once a minute; when
the text has changed, the page updates itself. The copy is also refreshed on
each gather that fetches the reference docs, which adds one Google request to
the day's first gather. **Check my entry** and `bb weekly-review entry` read
the doc fresh, since the agent should see what the entry says now.

**Check my entry** sends an agent to read the week for itself and say what the
entry missed. The prompt carries no evidence, only where to find it: the entry
(`entry`), the gathered week (`digest`), the 1:1 and meeting notes matched to
each meeting (`meetings --notes`), a Slack search of the week's messages from
and mentioning you, the GitHub issues and pull requests in the configured repo
where the configured author commented or was mentioned, and the daily notes
when Reflect is reachable. The two GitHub searches are one `gh search` call
each, plus one call per conversation the agent decides to read.

It returns at most three things missing that you would regret leaving out,
and places where the entry, or an empty section such as People or Next, says
less than the sources do. It is told the entry is a team lead's record rather
than a changelog, so a merged pull request counts only when it carries a
decision, a risk, or a change of direction, and hours count only when the
number says something.

It opens the thread it started, and the page keeps a link back. The assessment
is a conversation to have while the entry is being rewritten, not a report to
receive: ask which findings matter, push back, ask for the evidence behind a
line. The agent re-reads the document before answering anything that turns on
what the entry currently says, and records a fresh assessment when enough has
changed to warrant one.

The page itself shows only that the entry was checked and how much came back.
The findings are worth arguing with, and a page cannot be argued with.

It proposes no replacement prose, and never edits the document. Feedback is
stored with the week, stamped with the heading of the entry it was given on, so feedback on a draft you have since rewritten shows as stale
rather than quietly wrong.

```sh
bb weekly-review entry <monday>                          # what the agent will read
bb weekly-review feedback <monday> --file <path-to-json>  # how it records the result
```

## Capturing an entry

The `weekly-journal-entry` skill, in `skills/`, writes one journal bullet
about one piece of work. Ask for it at the end of a thread ("add this to my
journal"), or in a thread started to document something, such as from a
priority on the Now page.

It drafts from the thread and from the week Weekly Review has gathered:
`entry`, `meetings --notes`, `digest`, `priorities`, and `source list`, all
through the CLI below. Those read the database, apart from `entry`, which
reads the journal doc once.

The bullet follows the doc's own format. A Done bullet starts with a
past-tense verb, links the words that name the work, and says who was
involved, why, and how it came out, with sub-bullets for a group of related
items, a verbatim quote, or an `AI-Native SDLC:` note. It leaves
Reflections/Learnings to you, and asks rather than guessing when the
evidence does not say how something went.

The draft appears as a card above the composer, with the source of each
claim. Edit it there, or send a note on what to change, and it comes back
revised.

Accept adds it to the doc with `bb weekly-review entry add`, at the end of its
section in the week's entry, with its links and bullet levels. When the week
has no entry yet, one is added first above the newest entry, headed with the
week's Friday and with that entry's section labels. That is one Docs read and
one write, or two of each when the entry is new. The write names the revision
it read, so Google refuses it if the doc changed in between, and it is tried
once more from a fresh read.

The new bullets form a list of their own, with the same bullets and indents
as the one above. The Docs API counts a new bullet's level from the list item
above it, so joining that list would put a top-level entry under a sub-bullet.

## Coming up

The calendar is read through `gws` on the primary calendar, with `singleEvents`
set so a recurring meeting arrives as the instances it actually has.

Its window is measured from today rather than from the week being reviewed,
and runs from tomorrow through the end of next week. The review range can point
at a week that has already finished — running it on a Saturday resolves to the
Monday–Friday just past — and nothing about that week says what is ahead.

Two things are dropped, both because a live payload contains them and neither
is a commitment. Google files working-location markers as events, so a plain
read of a fortnight returns a "Home" all-day row per working day. And an event
you have declined is still returned. Events marked "free" are kept and shown
more quietly: a focus block is real time, even though it is not a meeting.

Tasks come from the Todoist incomplete list already gathered for the digest.
Anything overdue leads the section; anything due inside the window sits on its
own day, never nudged onto a day it is not due on; anything due after next week
is counted in a line rather than listed. The no-due-date pile stays out — it is
a backlog, not a claim on next week. A recurring task due today or earlier is
spared the overdue block, and is today's business rather than next week's, so
it is not here either.

## Slack

Slack is reachable over MCP rather than from a script, so no fetcher can read
it. **Collect Slack** sends an agent, which finds the threads you sent a
message in or were mentioned in, reads each one, and records them with
`bb weekly-review slack`.

One entry per thread rather than per message, and a thread carried on across
several days belongs to the day it started, so it appears on the page once. The
`summary` is the one piece of judgment in the section — what the conversation
was about and what came of it — which is why it belongs to an agent and not to
a rule. What it cannot read it leaves out and says so; an invented summary is
worse than a gap.

```json
[{ "day": "2026-08-31", "channel": "#standup",
   "participants": ["Octocat"], "summary": "…", "permalink": "https://…" }]
```

## CLI

```
bb weekly-review list
bb weekly-review sync [<monday>|--from YYYY-MM-DD --to YYYY-MM-DD]
bb weekly-review digest <monday>
bb weekly-review meetings <monday> [--notes]
bb weekly-review notes <monday> --file <path-to-json>
bb weekly-review slack <monday> --file <path-to-json>
bb weekly-review entry <monday>
bb weekly-review entry add <monday> --section <label> --file <path-to-markdown>
bb weekly-review feedback <monday> --file <path-to-json>
bb weekly-review prompt [notes|slack|feedback|rules] [reset]
bb weekly-review table [<monday>]
bb weekly-review unsorted [<monday>]
bb weekly-review workstream list | add <name> | rename <name> <new name> | retire <name>
bb weekly-review rule list | add <workstream> <ref|task|label|phrase> <value> | remove <id>
bb weekly-review rule propose <monday> --file <path-to-json>
bb weekly-review priorities [<monday>]
bb weekly-review priority link|unlink <monday> <bullet number> <workstream>
bb weekly-review assign <key> <workstream|none|rules>
bb weekly-review week <monday> add|hide|reset <workstream>
bb weekly-review source list | set <key> <value> | add-doc <id> <label> | remove-doc <id|label>
```

An activity's key, such as `harvest:entry:123`, is what `unsorted` prints
first on each line.

Weeks are identified by their Monday. `sync` with no argument does the
current week, Monday through today.

## Storage

Gathered weeks live in the plugin's SQLite database, next to the sources:

| Table | Holds |
|---|---|
| `gathers` | one row per gather: when it ran, what started it, and how each source did |
| `items` | one row per time entry, pull request, review, issue, task, or calendar event, per week |
| `doc_snapshots` | each reference doc's text, as of its last fetch |
| `agent_results` | what the Slack, notes, and feedback agents recorded |
| `workstreams`, `rules` | the workstreams and the rules that sort activity into them |
| `assignments` | activity moved to a workstream by hand, by its key |
| `week_workstreams` | workstreams added to or hidden from a week |
| `priority_links` | which workstreams each of a week's priorities is linked to |
| `rule_proposals` | rules the agent proposed, and whether each was accepted |
| `journal_snapshot` | the journal doc as of its last good read |

A gather updates items by their id in the source, so an entry edited in Harvest
is updated rather than added twice. An item the source no longer returns, such
as a deleted time entry or a reopened task, is marked removed and drops off the
page. The row stays in the table.

A source that fails changes nothing. The page keeps showing what that source
returned last time, with the error beside it, so an expired token never makes
a busy week look quiet. A reference doc that fails keeps its previous text.

Before the database, weeks were files under `data/weeks/<monday>/`. The plugin
imports each of those weeks once, the first time it loads with no gather for
that week, and leaves the files where they are.

## Development

```sh
npm install
npx tsc --noEmit
npm test
bb plugin build . && bb plugin reload weekly-review
```

The suites cover the parts that need no network: the calendar parser against
the shapes a live payload actually contains, the coming-up grouping, each agent
prompt against the placeholders its caller substitutes, and the week store,
gather, and file import against an in-memory database, the workstream
rules and table, and the requests that add an entry to the journal doc.

`review/` holds the logic and is deliberately free of BB: pure date and
bucketing functions, one fetcher per source that shells out to a CLI, the
gather that runs them, and the database-backed week and source stores. `server.ts` wires
them together; `app.tsx` draws the panel and the sources editor.
