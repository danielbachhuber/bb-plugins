---
name: tokenomics-find-improvements
description: Use when the user invokes /tokenomics-find-improvements, or asks where bb threads waste tokens, how to cut token use, or to review recent threads for token savings, such as "find token improvements", "why did these threads use so many tokens", "what would make my threads cheaper", or "review this morning's threads for waste". Reads the costliest threads' calls within a 2M input-equivalent token budget and proposes fixes, such as a tool in the repository, a skill change, or an instruction, each priced by the cost it would have saved.
---

# Find token improvements

Read the threads that cost the most, find calls and context that did not
need to be there, and propose the change that removes them. A finding
counts only when it names the file to change, quotes the calls that show
the waste, and is priced from the turns it would have saved. A thread that
cost a lot on work that needed it is not a finding.

Cost is input-equivalent tokens: cache reads count 0.1, cache writes 1.25
(2 with an hour-long cache), output 5 on Claude Code. Most of a thread's
cost is its calls times its context, not cache misses, so the biggest wins
are usually fewer calls, a smaller context, or a smaller starting prompt.

The run stays inside a budget, 2M by default. `collect` picks as many
threads as the budget pays reviewers for, so do not add reviewers or read
digests yourself. Run this in a fresh thread.

## 1. Collect

```bash
bb tokenomics improvements collect --days 7
```

- A period: `--days N` (at most 30), `--since HH:MM` for today, or
  `--since <ISO time>`.
- Particular threads: one `--thread <id>` each. For "the threads I started
  this morning", filter `bb thread list --json` on `createdAt`.
- A different budget: `--budget 3M`.

A request for a run at a budget counts as going ahead: forecast the turn
with `--confirmed` rather than stopping to ask.

It prints the threads picked, the cache health, the estimate, warnings,
and the output directory on its last line. State the estimate and any
warnings. The directory holds a digest per thread (`<id>.md`: cost, cache
health, the outputs later calls paid most to re-read, then each turn with
its calls grouped under the model response that made them), a
`batch-<n>.md` per reviewer, `patterns.md`, `projects.md` (each project's
checkout and starting prompt), `index.tsv`, and `run.json`.

## 2. Review

In one message, start one subagent per `batch-<n>.md` and one research
subagent, each with only this prompt:

- Batch reviewer: `Read <skill dir>/references/reviewer-prompt.md and do what it says. DIR=<output dir>, BATCH=<n>.`
- Research: `Read <skill dir>/references/research-prompt.md and do what it says. DIR=<output dir>.`

`<skill dir>` is the directory this file is in. Each writes its report to
the output directory and replies with the path. Read only the reports.

## 3. Merge into findings.json

Write `<output dir>/findings.json`:

```json
{
  "findings": [
    {
      "title": "Add a script that lists every caller of an RPC procedure",
      "waste": "repeated exploration",
      "fixType": "repository tool",
      "target": "/path/to/repo/scripts/procedure-callers.ts",
      "threads": ["thr_abc123", "thr_def456"],
      "removes": [
        { "threadId": "thr_abc123", "turn": 1, "calls": 12, "removed": 10 },
        { "threadId": "thr_def456", "contextCut": 3000 }
      ],
      "basis": "one command prints the callers the agents found with 10 greps and cats",
      "evidence": [{ "quote": "$ grep -rn \"widgets\\.get\" client server …  [7.6KB out]", "threadId": "thr_abc123", "turn": 1 }],
      "sources": [{ "title": "…", "url": "https://…", "date": "2026-11-02" }],
      "task": "…\n\nDone is:\n- …"
    }
  ]
}
```

- Copy each reviewer's fields as written; `Removes:` is already JSON.
  A `removes` entry has `removed` (calls the fix removes) or `contextCut`
  (tokens taken out of every call in the turn, or in the thread when
  `turn` is left out), or neither for the whole turn.
- Combine findings that share a target and a cause, and union their
  threads and `removes`. When two reviewers propose the same fix for
  different files, keep the target in the repository where the waste
  happened.
- `task` is the issue body and the PR thread's brief at once. Keep the
  reviewer's quoted file lines; never paraphrase a file.
- An idea from `report-research.md` joins a finding only when it fixes
  waste a reviewer found. Add its source to `sources` and say how in the
  task.
- Drop a finding whose fix an open thread already holds: `bb thread list`
  titles starting with `Improve:`.

Then:

```bash
bb tokenomics improvements price <output dir>/findings.json
```

It fills the thread counts from `run.json`, sets each finding's `project`
and `repo` from its target, checks every finding, prices each `removes`
from Tokenomics' turns, and ranks by cost saved. Fix what it reports and
run it again. Do not estimate tokens yourself.

## 4. Present

If Impromptu UI is available (`bb impromptu-ui help >/dev/null 2>&1`):

```bash
bb tokenomics improvements view <output dir>/findings.json > <output dir>/view.json
bb impromptu-ui publish --file <output dir>/view.json --key tokenomics-find-improvements
```

Each finding is a card with its cost and savings, evidence, an editable
draft (the issue body and the PR thread's task), **Open issue** when it
has a repo, **Start PR thread**, and **Revise**. A one-thread finding
saving under 1% of the analyzed cost is listed under Also seen, without
buttons.

When **Open issue** sends a draft, create the issue with
`gh issue create --repo <repo> --title "<finding title>" --body-file <file>`,
then publish again with that card's `url` set to the issue and
`status: {"label": "Issue opened", "tone": "success", "complete": true}`.

Without Impromptu UI, list the findings in chat, numbered, with title,
target, savings, and one evidence line, and ask which to open as issues
and which to start PR threads for (`bb thread spawn --project <name>
--title "Improve: <title>" --prompt-file <file>`, the file holding the
task and a `Found in:` line of `@thread:<id>` mentions).

End the run with the summary, which this prints as Markdown tables:

```bash
bb tokenomics improvements summary <output dir>/findings.json
```

Paste its output into your final message as it is, so the tables render.
Never put it in a code block.

## Common mistakes

- **Blaming tokens on the task.** Name the calls or context that were not
  needed.
- **A fix that restates the waste.** "Read less output" changes nothing.
  Name the filter, script, flag, file split, or setting.
- **Pointing at the transcript.** The PR thread never sees it. Put the
  facts, and the quoted file lines, in the task.
- **Proposing what exists.** Drop a finding whose tool or rule is already
  there, unless the evidence shows why it was not used.
