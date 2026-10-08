# bb-plugin-tokenomics

How many tokens your threads use, and when. A Tokenomics page in the sidebar
graphs token use over time and lists the threads behind it, and each thread's
header has a sparkline of its token use over time that opens a summary of
which of your messages used the most tokens and time. A thread whose context has grown past a
size you set shows a meter above its composer, with a button that compacts it. The
`bb tokenomics` command prints the same numbers per thread for scripts.

## The page

![The Tokenomics page for the past day: 110M tokens, an hourly stacked bar chart with one hour hovered, and five threads listed by tokens used](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--past-day-hovered.png)

- **The headline** is the period's total, with its three parts beneath it:
  new input, cache reads, and output.
- **The chart** has one bar per hour for "Past day" (the default, 24 bars)
  and "Past 3 days" (72 bars), and one bar per day for "Past week" (today and
  the six days before it). Each bar stacks new input, cache reads, and output.
  Hover a bar for its numbers. Click a legend entry to hide that part and
  rescale the chart. Cache reads are usually most of the total, so hiding them
  shows the other two.
- **The thread list** has the threads that used tokens in the period, most
  first, with each one's project, provider, number of turns, latest context
  size, and total. A thread archived before the plugin recorded context has
  no context size to show. Above it, "Active | Recent | Older" picks which threads it lists, with a count on
  each; it starts on Active. Recent lists the threads archived in the past
  three days, and Older the ones archived before that. Archived threads, and
  deleted ones, are dimmed and labeled "Archived". Beside each total is a
  sparkline of when that thread used its tokens, on the same hours or days as
  the chart and scaled to the thread's own busiest one, so a thread still
  running when you expected it to stop shows bars at the right end. Beside
  that is how long the thread's turns in the period took: one dot per turn on
  a log scale from 10 seconds to an hour, with a bar at the median, then the
  turns' total time with the median under it. Most turns take under a minute
  and a few take far longer, so a linear scale would pile the short ones at
  zero. A turn longer than an hour sits at the right end. Hover a bar in the
  sparkline for its tokens and when, a dot for how long that turn took and
  when it started, and the total for the longest turn. On a narrow window the dots and time drop out. Click a row to
  open the thread.
- **A large-context thread** is an active one whose latest context is past
  one of the context meter's settings (see below). Past the warning, 300K by
  default, its row gets an amber bar down its left edge over an amber tint, as
  the Now page marks what is due today, and its context size is bold amber.
  Past the error, 550K by default, the bar, tint, and context size are red,
  as Now marks what is overdue. A few of these threads
  usually account for most of a period's tokens.

The page re-reads when new usage is recorded and once a minute, so the newest
bar fills in while a thread runs.

## The header

![A thread header with a sparkline and "28M tokens", its summary open below: tokens per 15 minutes on a scale, with one spike hovered and the message behind it, the three biggest turns, and the split into new input, cache reads, and output](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--header-open.png)

A thread with recorded usage shows a button in the header's action row: a
sparkline of its token use over time and its lifetime total, such as
`39.5M tokens`. The sparkline splits the thread's recorded life into up to 20
equal stretches of time, so a quiet stretch reads as a gap and a burst reads as
a spike. In a narrow pane the sparkline drops out and the total stays. Click it
for the thread's summary, which is there to answer which of your messages set
off the tokens:

- the total, the number of turns, and when the thread's turns ran
- **Tokens per 15 minutes** (or per minute, hour, or day): the same chart,
  larger, in up to 36 buckets of a round size (1, 5, 15, or 30 minutes, or 1
  to 24 hours) that start on clock boundaries. The title names the size and a
  scale on the left gives the tokens, so a bar's height reads as tokens in that
  stretch of time. Hover a bucket for its time, its tokens, and the messages
  whose turns used them, with when each started, how long it ran, and its
  share of the thread.
- **Minutes per turn**: one bar per turn, in the order they ran, stacked
  into the model's time (thinking and writing), tools (shell commands, tool
  calls, file reads), and waiting on you to answer a question. Overlapping
  tools count once. The scale is in minutes, and the median turn is named
  under it. Hover a bar for the message that started the turn. Turns from
  before Tokenomics recorded times have no bar.
- **Biggest turns**: the three turns that used the most, the same way, each
  with a bar of its time split
- the split into new input, cache reads, and output, with each part's share
- how many of the total came from Claude Code subagents, when there are any
- how many of the total came from turns bb deleted before Tokenomics could
  record them, when there are any
- "Open Tokenomics", which goes to the page

A turn is one message of yours and everything the agent does in reply, so one
turn can run for an hour and make dozens of model calls. A message with only
attachments shows as "1 image" or "2 files". A turn you did not start, such as
a retry after an error, shows as "Continued without a new message".

The summary reads the messages from bb when it opens, not before, because that
means reading the thread's turn events. Until they arrive the chart draws the
recorded usage on its own.

A thread with no usage yet shows nothing. Claude Code reports usage when a turn
ends, so a thread still on its first turn has none.

## The context meter

![The context meter in each of its states: past the setting, a turn running, compacting, no usable window, compaction refused, and a narrow composer](https://raw.githubusercontent.com/danielbachhuber/bb-plugins-screenshots/main/tokenomics/page--context-meter-states.png)

A thread's context is everything the model reads on each call: the
conversation so far, tool results included. Every model call in a turn reads
all of it again from the prompt cache, so a turn's cache reads are roughly its
number of calls times the context's size. At 500K tokens of context, a turn of
40 calls reads 20M tokens. A thread that has grown that large keeps costing
that much on every turn until it is compacted.

Claude Code compacts on its own, but on a 1M-token model only once the context
reaches about 967K. So once a thread's context passes the **Warn when a
thread's context passes (tokens)** setting, 300K by default, a meter shows
above its composer. Past the **Mark a thread's context as too large past
(tokens)** setting, 550K by default, it turns from amber to red.

- the context size, in amber or red
- a bar of the context against the model's window, with a tick at each
  setting. When the provider reports a window smaller than the context,
  which Claude Code sometimes does, the bar and the window are left out
- how many tokens the latest turn used, and the window's size
- **Compact**, which asks bb to compact the thread. bb runs `/compact` as a
  turn, which replaces the conversation so far with a summary. bb compacts
  only an idle thread, so the button is disabled while a turn runs. Once the
  smaller context is reported, the meter goes away.

The meter sits above the other plugins' banners, including the GitHub context
one. It does not show on archived threads. In a narrow composer the bar and
the latest turn drop out. Set the thresholds with
`bb plugin config tokenomics set contextWarningAt 300K` and
`bb plugin config tokenomics set contextErrorAt 550K`. An empty warning turns
the meter off below the error; an empty error leaves only the warning.

bb reports the context size many times a turn. The plugin reads those events
in the same request it already makes for each thread's usage, so recording
them adds no requests to bb. The meter reads from the plugin's copy, and only
the first time it opens on a thread recorded before this copy existed does it
read bb's latest context event, one request. Each load's backfill does the
same, once, for every active thread with no context recorded, so the page can
mark large-context threads that have not run a turn since. Compact makes one
request.

## The command

`bb tokenomics` prints what the page and header show, for scripts and agents
that would otherwise read whole thread logs to find the expensive threads.

```sh
bb tokenomics threads [--days N] [--sort tokens|time|context] [--limit N] [--active] [--json]
bb tokenomics commands [--days N] [--limit N] [--json]
```

- `threads` lists each thread that used tokens in the past N days (default 7,
  at most 30), most first, 20 by default. For each: tokens split into new
  input, cache reads, and output, with Claude Code subagents included and
  counted; turns; peak and latest context; turn times (count, total, median,
  90th percentile, longest); how long the agent waited on your answers; and
  its three slowest shell commands. `--sort time` and `--sort context` rank by
  turn time or peak context instead, and `--active` leaves out archived
  threads.
- `commands` lists the shell commands that took the most time across all
  threads, with runs, total, median, and longest. Runs of one command are
  grouped by a short key, such as `npm test` or `git status`: a chained
  command line counts as its last step after `cd`, `source`, and the like,
  without pipes, redirections, or arguments.

Both read only the plugin's own database. Context sizes, turn times, and
command times go back only to when Tokenomics began recording them.

To go from these numbers to changes in how you work, consider the
[self-improve](https://github.com/danielbachhuber/skills/tree/main/skills/self-improve)
Claude Code skill. It reviews the past week of bb threads for where they
needed too much correction, took too many steps, used too many tokens, or
would have gone faster with a UI other than chat, and proposes fixes to the
skills and plugins involved. Reading every thread's transcript makes a run
expensive, so it uses `bb tokenomics threads` to choose which threads to read.

## Related plugins

- **Usage Meter** (`usage-meter`) shows Claude subscription limits and reads
  local Claude Code transcripts to explain where the limits went. Tokenomics
  reads bb's own usage events instead of transcripts, so it covers any provider
  that reports usage to bb, and it counts tokens rather than subscription
  limits.
- **Usage** (`usage-page`) and **Usage** (`usage`) track coding-agent token use
  with estimated API costs, on a dashboard and across enrolled machines.
  Tokenomics estimates no costs; it counts tokens per bb thread, by hour, and
  puts each thread's count in its header.
- **Receipts** (`receipts`) breaks token use and estimated cost down by model,
  project, and day. Tokenomics breaks it down by thread and by hour.
- **Usage Bar** (`usage-bar`) keeps provider quotas and reset times above the
  sidebar footer, with daily and monthly token totals. Tokenomics has no quota
  view.

## What counts

bb records a token usage event after each model turn. Each event carries that
turn's usage and the provider's running total for the thread. The plugin
records the per-turn figure and splits it three ways:

- **New input**: input the model read fresh, including tokens written to the
  prompt cache.
- **Cache reads**: input served from the prompt cache.
- **Output**: tokens the model wrote, reasoning included.

The three parts add up to the provider's `totalTokens`. Claude Code and Codex
report cached input differently: Claude Code's input count leaves cached tokens
out, and Codex's includes them. The plugin computes new input as the total minus
output minus cache reads, which gives the same meaning for both.

## Why it keeps its own copy

bb does not keep token usage history. Once a thread has a few hundred newer
events, bb deletes its older usage events and keeps only the latest one. So the
plugin copies every usage event into its own database as it arrives, and the
page and header read from that copy.

On each load it also reads every thread, archived and hidden ones included, to
pick up turns bb still has from before the plugin was installed or that ran
while it was not loaded, and to refresh which threads are archived. Archiving,
unarchiving, or deleting a thread between loads updates it straight away. It reads only events newer than the last one it saw
for each thread.

Turns bb had already deleted before the plugin first loaded cannot be
recovered. When a period starts before the plugin began recording, the page
says so under the chart, because those earlier bars can read low. The header
total uses the larger of two figures: the sum of recorded turns, and the
provider's latest running total. The sum misses turns bb deleted before they
were recorded. The running total misses turns from before the provider's last
restart, because Claude Code starts its count over when its session restarts.

## Subagents

bb reports only a thread's own usage. When a Claude Code thread runs
subagents, their tokens never reach bb, though they can be most of what the
thread cost: one review run used 4.6M tokens of its own and 55.7M in its 15
subagents. Claude Code writes each subagent's calls to a transcript under
`~/.claude/projects/<working directory>/<session>/subagents/`, so the plugin
reads those transcripts and adds their tokens to the page, the thread list,
and the header. A subagent's calls count toward the hours they ran in and the
turn that was running then, but not as turns of their own. The header summary
says how much of the total came from subagents.

The plugin reads a thread's transcripts when its turn ends, and on each load
reads every transcript that has grown since. Each thread's Claude Code session
id comes from its usage events, one request per thread the first time and
none after. Finding the transcripts lists the session folders on this machine
once, and again at most once a minute when a session is not among them. Only
threads that ran on this machine have transcripts here.

## Time

Alongside usage, the plugin records when each turn started and finished,
each tool the turn waited on (a shell command with its command line, a tool
call with the tool's name, a file read), and each question the agent asked
you, from asking to your answer. Reasoning and replies are the model's own
time, and background tasks and subagents run beside the turn rather than
holding it up, so neither is recorded as a tool. These come from the same
event request as usage, so they add no requests to bb. The first load with
this recording reads the past nine days of each thread again to fill them in. The header summary's
minutes-per-turn chart draws them.

## Matching usage to messages

The plugin's copy of each usage row has no turn id, and bb deletes the usage
events that had one. bb keeps every turn's start and end events, though, and
its conversation outline lists each of your messages followed by the turn it
started. So the summary gives each row to the latest turn that started at or
before the row was recorded, and gives each turn the message listed just
before it.

## Layout

| Path | What it holds |
| --- | --- |
| `usage/context.ts` | The pure reading of bb's context window events and of the warning setting |
| `usage/subagents.ts` | The pure reading of a subagent transcript's lines into model calls |
| `usage/subagent-files.ts` | The only module that touches `~/.claude`: finding a session's subagent transcripts and reading what is new in them |
| `usage/report.ts` | The pure reports `bb tokenomics` prints: per-thread summaries, command keys, and the slowest commands |
| `usage/timing.ts` | The pure reading of turn, tool, and question events into start and end times |
| `usage/breakdown.ts` | The pure split of a provider's usage into new input, cache reads, and output |
| `usage/store.ts` | The only module that touches SQLite: the ledger, each thread's context sizes, turn, tool, and question times, and subagent calls, per-thread cursors and archive state, and the hourly and per-thread sums |
| `usage/sync.ts` | The only module that reads from bb: copying new usage, context, and timing events into the ledger, one thread at a time, and reading a thread's turn events and outline |
| `usage/series.ts` | The page's ranges, bars in the viewer's time zone, a thread's time buckets, and number formatting |
| `usage/turns.ts` | The pure match of usage rows to turns, and of turns to the messages that began them |
| `usage/contract.ts` | The RPC contract and the realtime channels |
| `components/usage-view.tsx` | The page, drawn from props alone |
| `components/usage-chart.tsx` | The stacked bar chart and its legend |
| `components/thread-usage-list.tsx` | The thread list under the chart, its Active, Recent, and Older filter, and each row's sparkline |
| `components/hover-tip.tsx` | The readout that follows the pointer over a sparkline bar or a turn's dot |
| `components/turn-dots.tsx` | A thread's turn lengths as dots on a log scale, and the scale's labels |
| `components/segmented.tsx` | The segmented control the period and the thread filter use |
| `components/thread-token-count.tsx` | The header's sparkline button and the summary it opens, with the messages behind each spike |
| `components/context-meter.tsx` | The meter above the composer and its Compact button |
| `server.ts` | Listens for thread events, runs the backfill, serves the RPCs |
| `app.tsx` | Loads the data for the page, the header, and the context meter |
| `tokenomics.stories.tsx` | Each range, every thread listed, the empty page, the header button, its summary, and the context meter's states, including the hovered and open states the README shows |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload tokenomics
```

`npm run storybook` at the root of this repository renders the page and the
header button and its summary with invented data.

The README's images are the `PastDayHovered` and `HeaderOpen` stories, as
`npm run screenshots` captures them into `bb-plugins-screenshots`. They render
with a bar hovered and the summary open from the start, because the capture
takes each story as it first renders. Change those stories and the README's
images follow on the next capture.
