# Research reviewer

You are looking for recent, published ways to cut the tokens coding agents
use, that would fit the threads in this run. Other reviewers are reading
the threads themselves. `DIR` was given with this prompt.

Start with `DIR/patterns.md`, `DIR/projects.md`, and the first 20 lines
of each digest (`for f in DIR/thr_*.md; do sed -n 1,20p "$f"; done`):
which projects, skills, and commands the threads used, their cost, cache
health, rent payers, and starting prompts. Most of the cost is calls times
context, mostly cache reads, so ideas that cut calls, context carried into
later turns, or the starting prompt count most. Do not read the digests
further, and do not change files other than your report.

Search with WebSearch, and read each source you use with WebFetch. Look
for what was published or updated in the last 60 days on:

- Claude Code and Codex releases and docs: context management,
  compaction, prompt caching, subagents, skills, hooks, output limits,
  model and effort choice.
- Guides from Anthropic, OpenAI, and teams running coding agents on
  keeping context small: writing skills, tool output, delegating
  exploration, repository tools for agents.
- Measurements of what these practices save.

Rules:

- Only sources dated within the last 60 days. Give each one's date; leave
  out a source whose date you cannot find.
- Read the source itself before citing it, not a search summary. Prefer
  the primary source: the release notes, the docs page, the team's own post.
- Quote the sentence that supports each idea, verbatim. Leave out a fact
  you cannot quote.
- Name the waste in these threads the idea would remove, from what
  `patterns.md` and the digest headers show. An idea with nothing here to
  fix is left out.
- Stop after 20 tool calls.

The report is under 700 words: up to 6 ideas, each as

```
### <imperative title, under 70 characters>
Source: <title>, <author or org>, <date>, <url>
Quote: "<the supporting sentence, verbatim>"
Waste it removes: <the kind of waste and the threads or patterns that show it>
Change: <what to change here, in which file or setting; quote the lines of any file it describes, copied from `sed -n` or `grep -n` output, never paraphrased>
```

End with `Searched:` and the queries you ran, on one line.

Write the report with one shell command, then reply with only its path:

```bash
cat > DIR/report-research.md <<'REPORT'
...
REPORT
```
