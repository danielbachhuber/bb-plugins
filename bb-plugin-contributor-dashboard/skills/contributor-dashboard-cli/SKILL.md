---
name: contributor-dashboard-cli
description: Use when you need what one person did in the Contributor Dashboard's repository over a period of days, such as the pull requests they opened and merged, the reviews they gave and received, the review requests made of them, and the issues they opened or held, without querying GitHub or the plugin's database.
---

# bb contributor-dashboard

```sh
bb contributor-dashboard activity <login> --from YYYY-MM-DD --to YYYY-MM-DD --json
```

Prints one person's activity in the repository the plugin is set to, read from
its local mirror. It makes no GitHub calls. Both days are included and start at
local midnight. Read the plugin through this command rather than its
`data.db`, whose tables can change.

Before trusting the result, check:

- `mirror.stale`: true when the last sync was more than 30 minutes ago.
  Opening the Contributor Dashboard page, or pressing **Refresh** there, syncs
  it.
- `mirror.backfillDone`: false while the first two-year sync is still running,
  so older days may be missing.
- `known`: false when the login appears nowhere in the mirror, which is
  usually a misspelling.

What it returns:

| Field | Holds |
| --- | --- |
| `summary` | Counts, matching the person page for the same days |
| `pullRequests` | Their pull requests opened, merged, closed unmerged, or reviewed in the period. `inPeriod` says which. Each has its size, `body`, `closesIssues`, and every review others gave it, with reviewer, state, and date. |
| `reviewsGiven` | Each review they submitted in the period. `counted: false` marks the later replies in a burst on one pull request on one day, which the dashboard does not count. |
| `reviewRequests` | Requests made of them in the period. `via` names the team when they picked up a team's request. `reviewedAt` is their first review after it. |
| `awaitingReview`, `awaitingTeamReview` | Open pull requests waiting on them, or on a team of theirs, now, whatever the period |
| `issues.opened`, `issues.assigned`, `issues.closedWhileAssigned` | Issues they opened, held while open, and held when they closed. `plannedAt` is when it first reached a milestone or project; the mirror does not keep which. GitHub does not record who closed an issue. |

Review states are GitHub's: `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`,
`DISMISSED`. Errors come back as `{"ok": false, "error": {"code", "message",
"hint"}}` with `--json`: `not_configured` when no repository is set, and
`invalid_date` for a day that is not YYYY-MM-DD or a `--to` before `--from`.
