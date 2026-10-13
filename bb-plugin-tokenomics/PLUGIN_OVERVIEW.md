## What you get

A sparkline and total in **each thread's header**. Click it for a summary of that thread: tokens per stretch of time, minutes per turn, and the three turns that used the most. Hover a spike to see which of your messages started the turns behind it.

A **context meter above the composer** once a thread's context passes 300K tokens, turning red past 550K. Every model call in a turn reads the whole context again, so a 500K context costs 20M tokens on a turn of 40 calls. **Compact** asks bb to compact the thread. The sidebar counts these threads beside Tokenomics in amber and red, so you can find them without opening each one.

A **Tokenomics** page in the sidebar. Its chart shows tokens per hour for the past day or three days, or per day for the past week, with each bar split into new input, cache reads, and output. Under the chart, **Where turn time goes** splits the period's turns into the model's time, tools, and waiting on you, and names the shell commands that took the longest. The thread list ranks threads by tokens used. Each row has its context size, a sparkline of when it used them, and a dot for each turn's length.

## For scripts and agents

`bb tokenomics threads` lists each thread's tokens, turns, peak and latest context, turn times, and slowest shell commands. You can sort by tokens, time, or context. `bb tokenomics commands` lists the shell commands that took the most time across all threads. Both print JSON with `--json`, so an agent can find the expensive threads without reading their transcripts.

## How it counts

bb deletes a thread's older usage events once it has a few hundred newer ones. So Tokenomics copies each one into its own database as it arrives, and on each load reads any that bb still has. Turns bb deleted before the plugin was installed cannot be recovered, and the page says when a period starts before recording began.

Claude Code subagents report no usage to bb. Tokenomics reads their transcripts from Claude Code's folder on the machine bb runs on and adds their tokens to the thread that ran them.

## Settings

Set the meter's two thresholds with `bb plugin config tokenomics set contextWarningAt 300K` and `bb plugin config tokenomics set contextErrorAt 550K`.

## Where it's going

The aim is to read each thread's cost against the business value of the work it did. Tokenomics covers the cost side today. It does not yet record what a thread produced, so weighing the two is still up to you.

## Requirements

- Works with any provider that reports token usage to bb.
- Counts tokens only. It makes no cost estimates and has no quota view.
- Subagent tokens are counted only for Claude Code threads that ran on the machine bb runs on.
- No account or external service.
