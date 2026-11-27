## What you get

- **Tokens in each thread's header**: a sparkline of the thread's tokens over time, with its past day and lifetime totals. Click it to see which of your messages used the most tokens and time.
- **Each turn's time, tokens, and commands** under the turn, with the running turn counted above the composer.
- **Claude's forecast for each turn**: Claude records an 80% range of model calls, its subagents' included, Tokenomics works out the minutes and tokens, and the line under the turn shows each number against it, amber when the turn ran over.
- **A check before costly turns**: when a forecast could pass 10M tokens, Claude stops and asks you first, with the turn's share of your session.
- **Each thread's goal** on the token button in the thread header: a donut with a segment per "Done is" entry, a grouped one as long as its items and filled by its count, and the goal, its list, and what it has used at the top of the summary, with the same donut beside the thread in the sidebar. Claude records it in the first turn, up to 5 entries at low detail or 25 at high, grouping larger work with counts, and an estimate checked against past threads, and closes it as met, partly met, or not met. `/tokenomics-update-goal` changes it, and `/tokenomics-clear-goal` removes it.
- **A context meter above the composer** once a thread's context passes 300K tokens, red past 550K, or once an idle thread's prompt cache expires, with a **Compact** button.
- **Your session in the title bar**: a spark chart of its tokens and rings for the session and the week, amber or red once either is headed for its limit, with a pair for each subscription when you have more than one. Hover it for the limits, the past day's chart, and the session's top ten threads with what each goal has spent against its estimate.
- **Where threads waste tokens**: `/tokenomics-find-improvements` reads the costliest recent threads within a budget, weighs tokens by what they cost (a cache read counts a tenth of fresh input), and proposes fixes such as a script in your repository or a shorter skill, each priced by what it would have saved, as cards that open an issue or start a thread for the pull request.
- **A Tokenomics page** with each usage limit and where it lands at the current pace, tokens by hour or day, where turn time went, the threads that used the most, and what each goal outcome cost.

## How it works

Tokenomics copies each usage event into its own database as bb records it, starting when you install it, and reads Claude Code subagent transcripts from disk. It reads your usage limits from bb every five minutes. It counts tokens, not dollars.

## For agents

`bb tokenomics goal` records, moves, and closes a thread's goal. `bb tokenomics threads`, `bb tokenomics accounts`, `bb tokenomics commands`, and `bb tokenomics forecasts` print the same numbers, with `--json`, so an agent can find expensive threads without reading their transcripts. `bb tokenomics improvements` collects, prices, and presents the find-improvements skill's work.

## Requirements

bb 0.43 or later, and a provider that reports token usage to bb. Usage limits need one that reports them, such as Claude Code or Codex. No account or outside service.
