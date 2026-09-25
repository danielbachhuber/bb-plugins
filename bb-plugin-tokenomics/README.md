# bb-plugin-tokenomics

How many tokens your threads use, and when. A Tokenomics page in the sidebar
graphs token use over time and lists the threads behind it, and each thread's
header has a sparkline of its token use over time that opens a summary of
which of your messages used the most.

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
  first, with each one's project, provider, number of turns, and total. Above
  it, "Active | Recently active | Older" picks which threads it lists, with a
  count on each; it starts on Active. Recently active lists the threads
  archived in the past three days, and Older the ones archived before that.
  Archived threads, and deleted ones, are dimmed and labeled "Archived". Beside each total is a sparkline of when that thread used
  its tokens, on the same hours or days as the chart and scaled to the thread's
  own busiest one, so a thread still running when you expected it to stop shows
  bars at the right end. Click a row to open the thread.

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
- **Biggest turns**: the three turns that used the most, the same way
- the split into new input, cache reads, and output, with each part's share
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
| `usage/breakdown.ts` | The pure split of a provider's usage into new input, cache reads, and output |
| `usage/store.ts` | The only module that touches SQLite: the ledger, per-thread cursors and archive state, and the hourly and per-thread sums |
| `usage/sync.ts` | The only module that reads from bb: copying new usage events into the ledger, one thread at a time, and reading a thread's turn events and outline |
| `usage/series.ts` | The page's ranges, bars in the viewer's time zone, a thread's time buckets, and number formatting |
| `usage/turns.ts` | The pure match of usage rows to turns, and of turns to the messages that began them |
| `usage/contract.ts` | The RPC contract and the realtime channel |
| `components/usage-view.tsx` | The page, drawn from props alone |
| `components/usage-chart.tsx` | The stacked bar chart and its legend |
| `components/thread-usage-list.tsx` | The thread list under the chart, its Active, Recently active, and Older filter, and each row's sparkline |
| `components/segmented.tsx` | The segmented control the period and the thread filter use |
| `components/thread-token-count.tsx` | The header's sparkline button and the summary it opens, with the messages behind each spike |
| `server.ts` | Listens for thread events, runs the backfill, serves the RPCs |
| `app.tsx` | Loads the data for the page and the header |
| `tokenomics.stories.tsx` | Each range, every thread listed, the empty page, the header button, and its summary, including the hovered and open states the README shows |

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
