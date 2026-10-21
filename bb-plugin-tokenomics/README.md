# Tokenomics

Understand what your threads cost in tokens and time, so you can cut what
isn't worth it. The goal is to weigh each thread's cost against the business
value of the work it did. Today Tokenomics covers the cost. It doesn't record
what a thread produced, so the weighing is up to you.

It shows cost in five places:

- **A sparkline in each thread's header**, with its tokens in the past day
  and its lifetime total. Click it to see which of your messages used the
  most tokens and time.
- **A context meter above the composer**, once a thread's context passes a
  size you set, with a button that compacts it. The sidebar counts these
  threads in amber and red.
- **Your session in bb's title bar**, as a spark chart of its tokens and two
  rings for the percent used, the session outside and the week inside, amber
  or red once either is headed for its limit.
- **A Tokenomics page** in the sidebar, with your subscription's usage limits
  and where they're headed, tokens by hour or day, where turn time went, and
  the threads that used the most.
- **`bb tokenomics`**, which prints the same numbers for scripts and agents.

Tokenomics counts tokens, not dollars. bb deletes old usage events, so the
plugin keeps its own copy, starting when you install it.

![A thread with 28M tokens and a sparkline in its header, and a red meter above its composer: 620K context against a 1M window, with a Compact button](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--thread-with-meter.png)

## Install

This repository holds several plugins, so the command names the plugin and its
tag prefix:

```sh
bb plugin install git:https://github.com/danielbachhuber/bb-plugins.git@^0.1.0 \
  --plugin tokenomics --tag-prefix tokenomics/
```

Tokenomics needs bb 0.43 or later. It works with any provider that reports
token usage to bb, and needs no account or outside service. It counts Claude
Code subagents only for threads that ran on the same machine as bb, because it
reads their transcripts from disk (see [Subagents](#subagents)).

## The header

![A thread header with a sparkline and "28M tokens", its summary open below: tokens per 15 minutes on a scale, with one spike hovered and the message behind it, the three biggest turns, and the split into new input, cache reads, and output](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--header-open.png)

Once a thread has recorded usage, its header shows a sparkline, its tokens in
the past day in bold, and its lifetime total under them, small, after
Tokenomics' coin stack, as the page's thread list does. The sparkline splits the
thread's life into up to 20 equal stretches, so a quiet stretch is a gap and a
burst is a spike. In a narrow pane only the numbers show.

Click it to see which of your messages set off the tokens. The summary shows:

- the total, the number of turns, and when they ran
- **Tokens per 15 minutes**, a larger version of the sparkline. Its buckets
  are a round size, from 1 minute to 24 hours, chosen so there are at most 36,
  and they start on the clock. The title names the size. Hover a bucket for its tokens and the messages
  behind them, with when each started, how long it ran, and its share of the
  thread.
- **Minutes per turn**, one bar per turn, split into the model's time, tools,
  and waiting on you to answer a question. Tools that overlap count once. The
  median turn is named under the chart. Hover a bar for the message that
  started the turn. Turns from before Tokenomics recorded times have no bar.
- **Biggest turns**, the three that used the most tokens, each with its time
  split
- the split into new input, cache reads, and output
- how much came from Claude Code subagents, if any
- how much came from turns bb deleted before Tokenomics recorded them, if any
- **Open Tokenomics**, which goes to the page

A turn is one message of yours and everything the agent does in reply, so one
turn can run for an hour and make dozens of model calls. A message with only
attachments shows as "1 image" or "2 files". A turn you didn't start, such as
a retry after an error, shows as "Continued without a new message".

The summary loads the thread's messages when you open it, because that means
reading the thread's turn events. Until they arrive, the chart shows usage
alone.

A thread with no usage shows nothing. Claude Code reports usage when a turn
ends, so a thread on its first turn has none yet.

## The context meter

![The context meter in each of its states: past the setting, a turn running, compacting, no usable window, compaction refused, and a narrow composer](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--context-meter-states.png)

A thread's context is everything the model reads on each call, including the
conversation so far and tool results. Every call in a turn reads all of it
again from the prompt cache. At 500K tokens of context, a turn of 40 calls
reads 20M tokens, and every later turn costs about the same until the thread
is compacted.

Claude Code compacts on its own, but on a 1M-token model it waits until about
967K. So Tokenomics shows a meter above the composer once the context passes
the **Warn when a thread's context passes (tokens)** setting, 300K by default.
Past **Mark a thread's context as too large past (tokens)**, 550K by default,
the meter turns from amber to red. It shows:

- the context size
- a bar of the context against the model's window, with a tick at each
  setting. Claude Code sometimes reports a window smaller than the context.
  When it does, the bar and window are left out.
- how many tokens the latest turn used, and the window's size
- **Compact**, which asks bb to run `/compact`. That replaces the conversation
  so far with a summary. bb compacts only an idle thread, so the button is
  disabled while a turn runs. The meter goes away once the smaller context is
  reported.

The meter sits above other plugins' banners. It doesn't show on archived
threads, and in a narrow composer the bar and latest turn drop out. To change
the thresholds:

```sh
bb plugin config tokenomics set contextWarningAt 300K
bb plugin config tokenomics set contextErrorAt 550K
```

Clear the warning and the meter shows only past the error. Clear the error and
it shows only the warning.

bb reports the context size many times a turn. Tokenomics reads those events
in the request it already makes for usage, so recording them costs no extra
requests. The meter reads from the plugin's copy. The first time it opens on a
thread recorded before that copy existed, it reads bb's latest context event,
one request. Each load does the same once for every active thread with no
context recorded, so the page can flag large threads that haven't run a turn
since. Compact makes one request.

## The page

![The Tokenomics page for the past day: 110M tokens, an hourly stacked bar chart with one hour hovered, and five threads listed by tokens used](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--past-day-hovered.png)

The headline is the period's total, with new input, cache reads, and output
beneath it.

The chart has one bar per hour for **Past day** (the default) and **Past 3
days**, and one bar per day for **Past week**. Each bar stacks the three
parts. Hover a bar for its numbers. Click a legend entry to hide that part and
rescale. Cache reads are usually most of the total, so hiding them shows the
other two.

The page reloads when new usage is recorded and once a minute, so the newest
bar fills in while a thread runs.

### Usage limits

![The Tokenomics page with a red Current session meter, 52% used, saying it runs out at 3:56 PM, 1h 54m before it resets, and the chart running on to the reset with hatched bars, red past the point it runs out](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--limit-runs-out.png)

Above the chart, a meter for each of your subscription's limits, such as
Claude Code's **Current session** and **Weekly limit**, shows the percent used
of about how many tokens the limit holds, such as "28% of ~300M", and when it
resets. A lighter fill and a sentence say where it lands at
the current pace: "On pace for 95% by 8:50 AM", or "On pace to run out at
6:56 AM, 1h 54m before it resets". A meter turns amber once a limit is on pace for 80%,
and red once it will run out first.

The size comes from your usage patterns: in each window read far enough in,
25% for a session or 10% for a week, the tokens your threads used divided by
the percent used. The typical size is the median of up to ten past windows,
and the current window's own figure counts for as much of the estimate as the
window is used, 40% at 40% used, since early readings are rounded and swing
with a cache rewrite or a compaction. The limit isn't counted purely in
tokens, so it's an estimate. Until one window has been read far enough in,
the meter says "sizing the limit". It costs up to eleven local queries per
limit each time the page loads the limits.

The session's pace is its past hour, and the weekly limit's is its past day.
On **Past day**, once the session is amber or red, the chart runs on to its
reset with hatched bars at the past hour's tokens, red past the point it runs
out.

Tokenomics reads the limits every five minutes, whether or not the page is
open: one request to bb, which asks each provider that reports usage. It
keeps the readings for nine days. A provider no thread used this week shows
only when it's close to a limit. With more than one subscription, each one's
meters sit under its provider's name.

### In the title bar

![Five title-bar buttons for a session: calm at 10%, amber at 28% with hatched bars for the time left, red at 52% with the hatching turning red, used up at 100%, and 48% while measuring the pace](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--title-bar.png)

After the other plugins' buttons in bb's title bar, the session shows as a
spark chart of its tokens per 15 minutes, from its start to its reset, so the
empty space on the right is the time left, then two rings for the percent
used: the session's outer ring and the weekly limit's inner one. Once the
session is amber or red, the time left fills with hatched bars at the past
hour's pace, red past the point it runs out, as on the page's chart. Hover it
for the meters and the past day's tokens per hour; click it to open the page. With two subscriptions, it shows
the session closer to its limit.

It reads the same limits as the page, again when a turn's usage is recorded,
and the past day's hours each time you hover it, both from Tokenomics' own
database, so it makes no requests to a provider.

### Where turn time goes

Under the chart, the period's finished turns are split into the model's time,
tools, and waiting on you.

- **By kind** ranks them, with tools broken into shell commands, tool calls,
  file reads, subagents, and the rest. Kinds under 1% fold into Other tools.
  Tools of different kinds can run at once, so the kinds can add up to a bit
  more than the tools total. Under Shell commands are the three that took the
  most time, with how many times each ran.
- **By turn length** groups turns into under 1 minute, 1 to 5, 5 to 15, and
  longer. Each bar's length is those turns' total time, so you can see whether
  the time went to many short turns or a few long ones.

Hover a kind or command for its count. In a narrow window the two halves
stack.

### The thread list

The list has the threads that used tokens in the period, most first. Each row
shows:

- the thread's project, provider, turns, latest context size, and total. A
  thread archived before Tokenomics recorded context has no context size.
- its tokens in the period, beside a sparkline of when it used them, on the
  chart's hours or days and scaled to the thread's busiest one. The number is
  bold, and under it, small and after Tokenomics' coin stack, is the thread's
  lifetime total, which takes one query of Tokenomics' own database per row. A thread still running when you
  expected it to stop has bars at the right end.
- how long its turns took, as one dot per turn on a log scale from 10 seconds
  to an hour, with a bar at the median. Most turns take under a minute and a
  few take far longer, so a linear scale would pile the short ones at zero.
  Turns over an hour sit at the right end. Then comes the total, with the
  median under it.

Hover a sparkline bar, a dot, or the total for its details. Click a row to
open the thread. In a narrow window the dots and time drop out.

The list holds every thread that used tokens in the period: active threads
first, then archived and deleted ones under an **Archived** heading, dimmed.
Each group is ordered by tokens, and the counts sit above the list.

### Large-context threads

An active thread whose latest context passes the meter's warning setting gets
an amber bar down the left edge of its row, an amber tint, and its context
size in bold amber. Past the error setting, all three are red. A few of these
threads usually account for most of a period's tokens.

Beside Tokenomics in the sidebar, an amber circle counts the active threads
past the warning and a red one counts those past the error, whether or not
they used tokens in the page's period. Each thread counts once, at the higher
setting it passes, and a circle at zero is hidden. The count reads the
plugin's own database when the sidebar loads, when a context size is recorded
or a thread is archived, and once a minute so a changed setting shows.

## The command

`bb tokenomics` prints what the header and page show, so scripts and agents
can find expensive threads without reading whole thread logs.

```sh
bb tokenomics threads [--days N] [--sort tokens|time|context] [--limit N] [--active] [--json]
bb tokenomics commands [--days N] [--limit N] [--json]
```

- `threads` lists the threads that used tokens in the past N days (default 7,
  at most 30), most first, 20 by default. For each, it gives tokens split
  three ways with Claude Code subagents included, turns, peak and latest
  context, turn times (count, total, median, 90th percentile, longest), time
  spent waiting on your answers, and the three slowest shell commands. `--sort
  time` or `--sort context` ranks by turn time or peak context, and `--active`
  leaves out archived threads.
- `commands` lists the shell commands that took the most time across all
  threads, with runs, total, median, and longest. It groups runs by a short
  key such as `npm test` or `git status`. A chained command line counts as its
  last step after `cd`, `source`, and similar, without pipes, redirections, or
  arguments.

Both read only the plugin's own database. Context sizes, turn times, and
command times go back only to when Tokenomics started recording them.

To turn these numbers into changes in how you work, try the
[self-improve](https://github.com/danielbachhuber/skills/tree/main/skills/self-improve)
Claude Code skill. It reviews the past week of bb threads for ones that needed
too much correction, took too many steps, used too many tokens, or would have
gone faster with a UI other than chat, and proposes fixes to the skills and
plugins involved. Reading every transcript is expensive, so it uses `bb
tokenomics threads` to pick which ones to read.

## Related plugins

- **Usage Meter** (`usage-meter`) shows Claude subscription limits and reads
  Claude Code transcripts to explain where they went. Tokenomics reads bb's
  usage events instead, so it covers any provider that reports usage to bb,
  and it counts tokens rather than subscription limits.
- **Usage** (`usage-page`) and **Usage** (`usage`) track coding-agent token use
  with estimated API costs, on a dashboard and across enrolled machines.
  Tokenomics estimates no costs. It counts tokens per thread and by hour, and
  puts each thread's count in its header.
- **Receipts** (`receipts`) breaks token use and estimated cost down by model,
  project, and day. Tokenomics breaks it down by thread and by hour.
- **Usage Bar** (`usage-bar`) shows provider quotas and reset times above the
  sidebar footer, with daily and monthly token totals. **Usage Limits** shows
  the same quota windows across connected hosts, and
  **Provider usage**, bundled with bb, shows them in a sidebar card and in
  settings. Tokenomics reads the same limits, and adds where each is headed
  at the current pace, drawn on its token chart.
- **Auto Compact** (`auto-compact`) compacts a thread on its own once its
  context reaches a percentage of the window. Tokenomics warns at a token
  count you set, counts those threads in the sidebar, and leaves compacting to
  you.
- **Context Meter** (`context-meter`) tracks a thread's context against a
  limit you set. Tokenomics does the same with two settings, and adds token
  use over time for each thread and across all of them.
- **Context Health** (`context-health`) shows what makes up one thread's
  context, such as messages, tool output, and skills. Tokenomics shows how
  large each thread's context is and how many tokens it used over time, across
  all threads.

## What counts

bb records a usage event after each model turn, with that turn's usage and the
provider's running total for the thread. Tokenomics records the per-turn
figure and splits it three ways:

- **New input** is input the model read fresh, including tokens written to the
  prompt cache.
- **Cache reads** is input served from the prompt cache.
- **Output** is tokens the model wrote, reasoning included.

The three add up to the provider's `totalTokens`. Claude Code's input count
leaves out cached tokens and Codex's includes them, so Tokenomics computes new
input as the total minus output minus cache reads. That gives the same meaning
for both.

## Why it keeps its own copy

bb doesn't keep usage history. Once a thread has a few hundred newer events,
bb deletes its older usage events and keeps only the latest. So Tokenomics
copies each usage event into its own database as it arrives, and the header
and page read from that copy.

On each load it also reads every thread, including archived and hidden ones.
That picks up turns bb still has from before the plugin was installed or from
while it wasn't loaded, and refreshes which threads are archived. It reads
only events newer than the last one it saw for each thread. Archiving,
unarchiving, or deleting a thread between loads updates it right away.

Turns bb deleted before the plugin first loaded are gone. When a period starts
before recording began, the page says so under the chart, because those bars
can read low. The header total is the larger of two figures: the sum of
recorded turns, which misses turns bb deleted first, and the provider's latest
running total, which misses turns from before Claude Code last restarted its
session.

## Subagents

bb reports only a thread's own usage. A Claude Code thread's subagents never
reach bb, though they can be most of what the thread cost. One review run used
4.6M tokens of its own and 55.7M in its 15 subagents. Claude Code writes each
subagent's calls to a transcript under
`~/.claude/projects/<working directory>/<session>/subagents/`, so Tokenomics
reads those and adds their tokens to the header, the page, and the thread
list. A subagent's calls count toward the hours they ran in and the turn
running then, but not as turns of their own.

Tokenomics reads a thread's transcripts when its turn ends, and on each load
reads any that have grown since. It gets each thread's Claude Code session id
from its usage events, one request per thread the first time. Finding the
transcripts lists the session folders on this machine once, and again at most
once a minute when a session isn't among them. Only threads that ran on this
machine have transcripts here.

## Time

Alongside usage, Tokenomics records when each turn started and finished, each
tool the turn waited on (a shell command with its command line, a tool call
with its name, a file read), and each question the agent asked you, from asking
to your answer. Reasoning and replies count as the model's time. Background
tasks and subagents run beside the turn without holding it up, so neither
counts as a tool.

These come from the same request as usage, so they cost no extra requests. The
first load with this recording reads the past nine days of each thread again
to fill them in. The page works out Where turn time goes from the plugin's own
copy each time it loads.

## Matching usage to messages

The plugin's usage rows have no turn id, and bb deletes the usage events that
had one. bb does keep every turn's start and end events, and its conversation
outline lists each of your messages followed by the turn it started. So the
summary gives each usage row to the latest turn that started at or before it,
and each turn to the message listed just before it.

## Layout

| Path | What it holds |
| --- | --- |
| `usage/context.ts` | Reads bb's context window events and the warning setting |
| `usage/subagents.ts` | Turns a subagent transcript's lines into model calls |
| `usage/subagent-files.ts` | The only module that touches `~/.claude`: finding a session's subagent transcripts and reading what is new in them |
| `usage/report.ts` | The reports `bb tokenomics` prints: per-thread summaries, command keys, and the slowest commands |
| `usage/timing.ts` | Turns turn, tool, and question events into start and end times, each turn's split, and the period's breakdown |
| `usage/breakdown.ts` | Splits a provider's usage into new input, cache reads, and output |
| `usage/store.ts` | The only module that touches SQLite: the ledger, each thread's context sizes, turn, tool, and question times, and subagent calls, per-thread cursors and archive state, and the hourly and per-thread sums |
| `usage/sync.ts` | The only module that reads from bb: copying new usage, context, and timing events into the ledger, one thread at a time, and reading a thread's turn events and outline |
| `usage/series.ts` | The page's ranges, bars in the viewer's time zone, a thread's time buckets, and number formatting |
| `usage/turns.ts` | Matches usage rows to turns, and turns to the messages that began them |
| `usage/contract.ts` | The RPC contract and the realtime channels |
| `components/usage-view.tsx` | The page, drawn from props alone |
| `components/usage-chart.tsx` | The stacked bar chart and its legend |
| `components/thread-usage-list.tsx` | The thread list under the chart, active threads above archived ones, and each row's sparkline |
| `components/hover-tip.tsx` | The readout that follows the pointer over a sparkline bar or a turn's dot |
| `components/turn-dots.tsx` | A thread's turn lengths as dots on a log scale, and the scale's labels |
| `components/thread-token-count.tsx` | The header's sparkline button and the summary it opens, with the messages behind each spike |
| `components/turn-time-breakdown.tsx` | The page's Where turn time goes section, by kind and by turn length |
| `components/context-meter.tsx` | The meter above the composer and its Compact button |
| `icons/tokenomics.svg` | The plugin's icon, a stack of coins from Hugeicons, used for the plugin and its sidebar entry |
| `server.ts` | Listens for thread events, runs the backfill, serves the RPCs |
| `app.tsx` | Loads the data for the page, the header, and the context meter |
| `tokenomics.stories.tsx` | Each range, each thread filter, the empty page, the header button and its summary, the context meter's states, and the example thread the README leads with |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload tokenomics
```

`npm run storybook` at the root of this repository renders every story with
invented data.

The README's images are the `ThreadWithMeter`, `HeaderOpen`,
`ContextMeterStates`, and `PastDayHovered` stories, as the screenshot capture
writes them into `bb-plugins-screenshots`. They render with a bar hovered and
the summary open from the start, because the capture takes each story as it
first renders. Change those stories and the images follow on the next capture.
