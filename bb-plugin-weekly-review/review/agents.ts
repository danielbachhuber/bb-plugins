/**
 * What an agent is asked about a week, and the shape of what it sends back.
 *
 * Two jobs, both of them things a script cannot do: fetching the daily notes,
 * which are only reachable over MCP, and reading the hand-written entry
 * against the evidence. Everything else the page shows is derived from the
 * record, so nothing else needs a model.
 */
import { z } from "zod";

/**
 * The default prompt for collecting the week's daily notes.
 *
 * A different kind of job from the feedback: this one fetches something a
 * script cannot reach and resolves the handful of meetings name matching could
 * not, and nothing it produces is a judgment about the work.
 */
export const DEFAULT_NOTES_PROMPT = `Collect this week's daily notes so they can sit beside the meetings they were
taken in.

The week runs {{FROM}} through {{TO}}.

1. Read the meetings already logged for the week:

   {{MEETINGS_COMMAND}}

   Each line is a time entry. A line marked \`needs notes\` has nothing matched
   to it yet. Not all of them are meetings, and not all of them will appear in
   the notes; that is fine.

2. Pull the daily note for each day in the range from Reflect. If a day has no
   note, skip it; do not invent one.

3. Split each day's note into one entry per meeting. A daily note is already
   written that way — a top-level bullet per conversation, its detail nested
   underneath. The bullet becomes \`title\` and everything under it becomes
   \`body\`, kept verbatim, including the names of who was there.

4. Where a bullet is plainly the same conversation as a logged meeting but is
   called something different — logged as "Phase 3 review", written up as "PSI
   deadline check-in" — set \`meeting\` to the time entry's text exactly as step
   1 printed it. Leave \`meeting\` off when the names already agree; the page
   matches those itself. Do not guess: an unmatched note still gets recorded,
   and a wrong pairing is worse than none.

5. Write the result to a file under /tmp as JSON:

   [ { "day": "YYYY-MM-DD", "title": "…", "body": "…", "meeting": "…" } ]

   then record it with:

   {{COMMAND}}

That command validates the file and puts the notes on the page. If it reports a
validation error, fix the file and run it again. Say which meetings you matched
and which you could not, then stop.`;

/**
 * The default prompt for collecting the week's Slack conversations.
 *
 * The same kind of job as the notes: Slack is reachable over MCP and nowhere
 * else, so no fetcher can do this. What comes back is evidence rather than a
 * reading — what was discussed and what came of it, not whether it went well.
 */
export const DEFAULT_SLACK_PROMPT = `Collect this week's Slack conversations so they sit beside the rest of the
week's evidence.

The week runs {{FROM}} through {{TO}}.

1. Find the threads you took part in. Two searches, both scoped to the range:

   - messages you sent, \`from:@me after:{{SEARCH_AFTER}} before:{{SEARCH_BEFORE}}\`
   - messages that mention you, the same date bounds

   Search public channels, private channels and DMs — all three are part of the
   week. A thread you were pulled into and stayed quiet in still counts: being
   named in it is what makes it yours.

2. Read each thread you find, so the record is what the conversation was rather
   than what one message in it said.

3. Record one entry per thread, not one per message. A thread carried on across
   several days belongs to the day it started, so it appears on the page once.

   - \`channel\` — the channel name, or the people in a DM
   - \`permalink\` — a link to the thread, so the page can point at it
   - \`participants\` — display names of who spoke
   - \`summary\` — what it was about and what came of it. A decision reached, a
     question still open, a hand-off agreed. Two or three sentences.

   Leave out what you cannot read rather than guessing at it, and say afterwards
   what you skipped. A channel you have no access to is a gap in the record; an
   invented summary is worse than a gap.

4. Write the result to a file under /tmp as JSON:

   [ { "day": "YYYY-MM-DD", "channel": "…", "permalink": "…",
       "participants": ["…"], "summary": "…" } ]

   then record it with:

   {{COMMAND}}

That command validates the file and puts the conversations on the page. If it
reports a validation error, fix the file and run it again. Say how many threads
you recorded and what you could not reach, then stop.`;

/**
 * The default prompt for proposing workstream rules.
 *
 * The rules are what sort a week, and they are refined a little at a time.
 * An agent is good at reading forty unsorted titles and seeing which belong
 * together; it proposes, and nothing is a rule until it is accepted on the
 * page.
 */
export const DEFAULT_RULES_PROMPT = `Propose rules that sort this week's unsorted activity into workstreams.

The week starts {{MONDAY}}.

1. Read what is unsorted, one activity per line, with the fields a rule can
   match on (its \`#N\`, its Harvest task, its labels, and its title):

   {{UNSORTED_COMMAND}}

2. Read the workstreams that already exist, and their rules:

   {{WORKSTREAMS_COMMAND}}

3. Propose rules. Each one names a workstream, which can be an existing one
   or a new one, plus a rule type and value:

   - \`ref\`: an issue or PR number. Catches the PR or issue and any time
     entry whose note starts \`#N\`. The best rule when there is a number.
   - \`task\`: a Harvest task name, exactly. Only when every entry booked to
     that task is the same work.
   - \`label\`: a Todoist or issue label.
   - \`phrase\`: words the titles contain. Pick a phrase specific enough not
     to catch unrelated work: "widget sync", not "sync".

   Prefer extending an existing workstream to inventing a new one. Propose a
   new workstream only for a body of work with several activities or a
   meaningful share of the hours. Leave one-off items unsorted rather than
   inventing a rule for each. Give each proposal a short \`reason\` saying
   what it would catch.

4. Write the proposals to a file under /tmp as JSON:

   [ { "workstream": "…", "type": "ref|task|label|phrase", "value": "…",
       "reason": "…" } ]

   then record them with:

   {{COMMAND}}

That command validates the file and shows the proposals on the page, where
each is accepted or rejected by hand. A new file replaces the week's open
proposals. If it reports a validation error, fix the file and run it again.
Say how many you proposed and what you left unsorted, then stop.`;

/** Substitutes `{{NAME}}` placeholders. A template missing one still works. */
export function renderPrompt(
  template: string,
  values: Record<string, string>,
): string {
  let out = template;
  for (const [name, value] of Object.entries(values)) {
    out = out.replaceAll(`{{${name}}}`, value);
  }
  return out;
}

/**
 * The agent's read of an entry that was written by hand.
 *
 * A separate job from the interpretation, and a smaller one. The entry is the
 * user's own writing and stays that way: nothing here proposes replacement
 * prose, and nothing in this plugin writes to the document. What an agent is
 * good for is having read all of the evidence at once, which is the one thing
 * a person drafting from memory has not done.
 */
export const missingItemSchema = z.object({
  title: z.string().trim().min(1).max(140),
  /** Why it is worth a line, from the week's evidence rather than in general. */
  why: z.string().trim().max(500),
  refs: z.array(z.number().int().positive()).max(30).default([]),
});

export const expandItemSchema = z.object({
  /** The words in the entry this is about, quoted so it can be found. */
  quote: z.string().trim().min(1).max(300),
  /** What the evidence adds that the entry does not say. */
  detail: z.string().trim().max(600),
  refs: z.array(z.number().int().positive()).max(30).default([]),
});

export const feedbackSchema = z.object({
  /** A sentence or two: what the entry covers well, and what it is light on. */
  assessment: z.string().trim().min(1).max(1200),
  /** In the week, absent from the entry. */
  missing: z.array(missingItemSchema).max(20).default([]),
  /** In the entry, thinner than the evidence supports. */
  expand: z.array(expandItemSchema).max(20).default([]),
  /** Stamped on ingest, not by the agent. */
  reviewedAt: z.string().optional(),
  /** The entry the feedback was given on, so stale feedback is visible as stale. */
  entryHeading: z.string().optional(),
});

export type MissingItem = z.infer<typeof missingItemSchema>;
export type ExpandItem = z.infer<typeof expandItemSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;

export const DEFAULT_FEEDBACK_PROMPT = `Someone has written this week's journal entry by hand and wants to know what
they missed. Check their draft against what actually happened, which you will
go and read for yourself.

The week runs {{FROM}} through {{TO}}.

You are not rewriting the entry, and you are not writing to the document. The
entry is theirs and stays in their words. Propose no replacement prose.

## Whose journal this is

The author leads a team. The entry is their record of the week: what they
decided, who they helped, what is at risk, and how the people they manage are
doing. They read it again months later, for performance reviews and to recall
why something was decided. It is not a changelog. A merged pull request
belongs in it only when it carries a decision, a risk, a change of direction,
or something they will want credit for.

The entry has sections: Done, Wins/Highlights, Reflections/Learnings, Next,
and People. Read all of them, including the ones that are empty.

## Where to look

Read each of these before you write anything. Your one advantage over the
author is having read all of it; skip a source and you lose that.

1. **The entry as it stands:**

   bb weekly-review entry {{MONDAY}}

2. **The gathered week:** hours, pull requests, issues, tasks, and the
   calendar for the next two weeks. Use it as an index of what to look into,
   not as the findings.

   bb weekly-review digest {{MONDAY}}

3. **1:1 and meeting notes:** the section of each 1:1 and meeting document
   written on the day of that meeting, printed under the meeting it belongs
   to. This is where most of what matters to a lead is: what each person
   raised, what was agreed, what is worrying someone.

   bb weekly-review meetings {{MONDAY}} --notes

4. **Slack:** search it yourself, scoped to the week, across public and
   private channels and DMs:

   - messages you sent, \`from:@me after:{{SEARCH_AFTER}} before:{{SEARCH_BEFORE}}\`
   - messages that mention you, with the same date bounds

   Open the threads that look like more than logistics and read them whole.
   A decision is often made in a thread nobody wrote down anywhere else.

5. **GitHub conversations** in {{REPO}}, where {{AUTHOR}} commented, reviewed,
   or was mentioned this week:

   gh search issues --repo {{REPO}} --commenter {{AUTHOR}} --updated {{FROM}}..{{TO}} --include-prs --json number,title,url --limit 100
   gh search issues --repo {{REPO}} --mentions {{AUTHOR}} --updated {{FROM}}..{{TO}} --include-prs --json number,title,url --limit 100

   Then read the ones that matter with \`gh pr view <n> --repo {{REPO}} --comments\`
   or \`gh issue view <n> --repo {{REPO}} --comments\`, and a pull request's
   review comments with \`gh api repos/{{REPO}}/pulls/<n>/comments\`. Look for
   a direction set, a disagreement settled, a person coached.

6. **Daily notes,** if you can reach Reflect: the daily note for each day of
   the week.

If a source cannot be reached, say which one at the top of your reply, and
do not present the feedback as complete without it.

## What to return

**assessment**: two or three sentences. What does the entry cover well, and
what is it light on? Be specific, and be willing to say it is already good.

**missing**: at most three things from the week that are absent from the
entry and that the author would regret leaving out. A quiet decision they will
need to remember in six months beats ten merged pull requests. Leave out what
they plausibly left out on purpose: routine fixes, docs tidying, dependency
bumps, the weekly deploy, standups. An empty list is a good answer.

**expand**: places where the entry says something the sources say more about,
and empty sections the sources could fill. Quote the words from the entry so
they can be found; for an empty section, quote its heading or name, such as
"Hubber:". Say what the sources add in outcomes: what was decided, who was
unblocked, what came of a conversation, what is still at risk. Mention hours
only when the number itself says something, such as review taking a third of
the week. For People and Reflections/Learnings, point to what was said in the
1:1s and threads; do not write the reflection for them.

Also compare Next with the calendar and the tasks due in the next two weeks,
and put anything worth adding under expand, quoting "Next:".

Every claim cites where it came from: an issue or pull request number in refs,
or the meeting, Slack thread, or document by name in the text. Say nothing you
cannot point to.

## Recording it

Write the result as JSON matching this shape:

{
  "assessment": "…",
  "missing": [ { "title": "…", "why": "…", "refs": [123] } ],
  "expand": [ { "quote": "…", "detail": "…", "refs": [456] } ]
}

Write it to a file under /tmp, then record it by running:

{{COMMAND}}

That command validates the JSON and puts it on the page. If it reports a
validation error, fix the file and run it again.

Then lay the same findings out here, in the thread, so they can be read without
opening the page: which sources you read, the assessment, then what is
missing, then what deserves more detail. Link every issue and pull request
number to https://github.com/{{REPO}}/issues/<n>.

This is a conversation, not a hand-off. Expect to be asked which findings
matter, to be pushed back on, and to be asked for the evidence behind a line;
go back to the source and quote it.

The entry is being rewritten in the document while you talk. Re-read it with
\`bb weekly-review entry {{MONDAY}}\` before answering anything that depends on
what it currently says, and record a fresh assessment with the same command
when enough has changed to be worth one. Never edit the document yourself.`;
