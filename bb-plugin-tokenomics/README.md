# bb-plugin-tokenomics

How many tokens your threads use, and when. A Tokenomics page in the sidebar
graphs token use over time and lists the threads behind it, and each thread's
header has a sparkline of its turns that opens a summary of where its tokens
went.

## The page

- **The headline** is the period's total, with its three parts beneath it:
  new input, cache reads, and output.
- **The chart** has one bar per hour for "Past day" (the default, 24 bars)
  and "Past 3 days" (72 bars), and one bar per day for "Past week" (today and
  the six days before it). Each bar stacks new input, cache reads, and output.
  Hover a bar for its numbers. Click a legend entry to hide that part and
  rescale the chart. Cache reads are usually most of the total, so hiding them
  shows the other two.
- **The thread list** has every thread that used tokens in the period, most
  first, with its project, provider, number of turns, and total. Click a row to
  open the thread.

The page re-reads when new usage is recorded and once a minute, so the newest
bar fills in while a thread runs.

## The header

A thread with recorded usage shows a button in the header's action row: a
sparkline of its last 24 turns, one bar per turn, and its lifetime total, such
as `39.5M tokens`. In a narrow pane the sparkline drops out and the total stays.
Click it for the thread's summary:

- the total, the number of turns, and when the first and last turns ran
- the split into new input, cache reads, and output, with each part's share
- a larger chart of tokens per turn, up to the latest 200 turns; hover a turn
  for when it ran and what it used, and otherwise the line under the chart
  names the largest turn
- the average per turn
- how many of the total came from turns bb deleted before Tokenomics could
  record them, when there are any
- "Open Tokenomics", which goes to the page

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
while it was not loaded. It reads only events newer than the last one it saw
for each thread.

Turns bb had already deleted before the plugin first loaded cannot be
recovered. When a period starts before the plugin began recording, the page
says so under the chart, because those earlier bars can read low. The header
total uses the larger of two figures: the sum of recorded turns, and the
provider's latest running total. The sum misses turns bb deleted before they
were recorded. The running total misses turns from before the provider's last
restart, because Claude Code starts its count over when its session restarts.

## Layout

| Path | What it holds |
| --- | --- |
| `usage/breakdown.ts` | The pure split of a provider's usage into new input, cache reads, and output |
| `usage/store.ts` | The only module that touches SQLite: the ledger, per-thread cursors, and the hourly and per-thread sums |
| `usage/sync.ts` | The only module that reads from bb: copying new usage events into the ledger, one thread at a time |
| `usage/series.ts` | The page's ranges, bars in the viewer's time zone, and number formatting |
| `usage/contract.ts` | The RPC contract and the realtime channel |
| `components/usage-view.tsx` | The page, drawn from props alone |
| `components/usage-chart.tsx` | The stacked bar chart and its legend |
| `components/thread-usage-list.tsx` | The thread list under the chart |
| `components/thread-token-count.tsx` | The header's sparkline button and the summary it opens |
| `server.ts` | Listens for thread events, runs the backfill, serves the RPCs |
| `app.tsx` | Loads the data for the page and the header |
| `tokenomics.stories.tsx` | Each range, the empty page, the header button, and its summary |

## Working on it

```sh
npm install
npx tsc --noEmit -p tsconfig.json
npm test
bb plugin build . && bb plugin reload tokenomics
```

`npm run storybook` at the root of this repository renders the page and the
header button and its summary with invented data.
