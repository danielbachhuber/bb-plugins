# bb-plugin-backlog-triage

A bb panel for working a repository's stale issue backlog one batch at a time,
approving every disposition by hand.

## The line it holds

The sweep decides **what is true** about an issue: how long it has been idle,
whether it was ever specified, typed, labelled, milestoned, or assigned. That is
a pure function of a `gh` payload and costs no model tokens.

Deciding **what to do** about an issue is a judgement, so it belongs to an
agent. "Research next N" spawns one thread, which reads each issue, checks it
against the codebase, and writes a proposal back through
`bb backlog-triage suggest`. The panel renders that proposal as an editable
draft.

Nothing reaches GitHub until you click Approve on a single row.

## Install

```bash
cd ~/projects/bb-plugins/bb-plugin-backlog-triage
npm install && bb plugin install . --yes
```

Requires `gh` on PATH and authenticated.

## The workflow

1. Pick a repository. The picker offers the repositories a bb project on this
   machine has checked out, not every repository the account can see: research
   means reading the code an issue refers to, so a repo with no checkout here is
   one a pass could never finish. The choice is persisted, so a pass resumes
   where it left off across sessions and reloads.
2. The sweep lists every open issue, ranked by staleness.
3. **Research next N** spawns a thread for the N stalest issues that have no
   suggestion yet. The composer lets that one batch differ from the settings.
4. Each researched row shows the suggested action, the agent's rationale, and an
   editable comment body. The box grows to fit the draft, because the text is
   the thing being approved and a clipped comment cannot be read.
5. The approve button names what it will do: **Close as not planned**, **Close
   as duplicate of #294**, **Ask for a repro**, **Keep open**. A close renders
   as destructive, so the row that shuts someone's issue does not look like the
   one that leaves it open. It posts the body as it stands in the textarea.
6. **Reject** records your reason, which is kept so a later pass can see why a
   suggestion was wrong.
7. A decided row collapses to one line and steps back: the comment is on GitHub,
   which the title links to, so what is left to act on is what draws the eye.

## Actions

| Action | Writes to GitHub on approval |
| --- | --- |
| `close` | Posts the comment, then closes with a reason |
| `comment` | Posts the comment only |
| `needsInfo` | Posts the question; the issue stays open |
| `keep` | Nothing; records that you looked |

`keep` is the only action that writes nothing. `needsInfo` posts, because asking
for a repro and not sending the question is no use to anyone.

The comment is posted before the close, deliberately. A close that fails leaves
an explanatory comment behind; a comment that fails after a close would leave an
issue shut with no reason on it.

### Close reasons

GitHub records why an issue was closed, and that outlives anyone's memory of the
pass, so a close carries one of its three reasons:

| Reason | For |
| --- | --- |
| `completed` | The thing asked for now exists, even if it arrived another way |
| `not planned` | Work nobody chose to do: obsolete, superseded, overtaken. The default |
| `duplicate` | Another issue covers it. Needs `--duplicate-of <number>` |

A duplicate closes with `--duplicate-of`, which sets the reason itself, so
`--reason` is not passed alongside it.

## Staleness ranking

Idle days, plus 120 for an empty body, 90 for no comments, 45 for no issue type,
30 for no milestone, 15 for no labels, minus 60 when someone is assigned. Ties
break by issue number, so issues filed in one sitting hold their order between
sweeps instead of reshuffling.

## Settings

- **Path to the gh CLI** — override when `gh` is not on the server's PATH.
- **Sync interval** — how often the background sweep re-reads the backlog.
  Default 15 minutes.
- **Issues per research batch** — default 10. The button names the current
  value, so it says what it will actually do.
- **Provider for research threads** — default `claude-code`. Pinned rather than
  inherited: skills are provider-scoped, and a thread that lands on another
  provider cannot resolve the ones the prompt relies on.
- **Model for research threads** — blank lets bb choose.

## Storage

Issue facts and triage decisions are separate tables. A sweep replaces the facts
and never touches the decisions, because a pass takes days while the sweep runs
every few minutes. There is a test for that.

A stored suggestion is normalized on read, filling fields it predates. Without
that, adding a field to the row makes the RPC layer reject the whole list rather
than the one row, and the only symptom is an empty panel and a line in the
server log.

## Development

```bash
npm install
npx tsc --noEmit -p tsconfig.json
npx vitest run
bb plugin build && bb plugin reload backlog-triage
```
