/**
 * Turns raw `gh` issues into ranked triage rows.
 *
 * Everything here is a pure function of its arguments, including the clock,
 * which is passed in rather than read. The sweep decides what is true about an
 * issue; deciding what to do about it belongs to a spawned thread.
 */

import { PENDING_DISPOSITION, type RawIssue, type Staleness, type TriageRow } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(fromIso: string, now: Date): number {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / DAY_MS));
}

/**
 * Ranks how confidently an issue can be treated as abandoned.
 *
 * Idle time dominates, because an issue nobody has touched in two years is
 * stale whatever else is true of it. The rest are corroborating signals: an
 * empty body means it was never specified, no comments means nobody ever
 * engaged, and no type, label, or milestone means it was never triaged. An
 * assignee counts against staleness — someone accepted it.
 */
export function scoreStaleness(s: Omit<Staleness, 'score'>): number {
  let score = s.idleDays;
  if (s.emptyBody) score += 120;
  if (s.commentCount === 0) score += 90;
  if (!s.hasType) score += 45;
  if (!s.hasMilestone) score += 30;
  if (!s.hasLabels) score += 15;
  if (s.assigned) score -= 60;
  return Math.max(0, score);
}

export function classifyIssue(issue: RawIssue, now: Date): Staleness {
  const base = {
    ageDays: daysBetween(issue.createdAt, now),
    idleDays: daysBetween(issue.updatedAt, now),
    emptyBody: (issue.body ?? '').trim().length === 0,
    commentCount: issue.comments?.length ?? 0,
    hasType: Boolean(issue.issueType?.name),
    hasLabels: (issue.labels ?? []).length > 0,
    hasMilestone: Boolean(issue.milestone?.title),
    assigned: (issue.assignees ?? []).length > 0,
  };
  return { ...base, score: scoreStaleness(base) };
}

export function toRow(issue: RawIssue, repo: string, now: Date): TriageRow {
  return {
    repo,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    author: issue.author?.login ?? 'unknown',
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    milestone: issue.milestone?.title ?? null,
    labels: (issue.labels ?? []).map((l) => l.name),
    staleness: classifyIssue(issue, now),
    suggestion: null,
    disposition: { ...PENDING_DISPOSITION },
  };
}

/**
 * Staleness descending, tie-broken by issue number.
 *
 * The tiebreak is not cosmetic: issues filed in one sitting share a timestamp
 * and every other signal, so without it those rows reshuffle between sweeps.
 */
export function rankRows(rows: TriageRow[]): TriageRow[] {
  return [...rows].sort(
    (a, b) => b.staleness.score - a.staleness.score || a.number - b.number,
  );
}

/** Rows still awaiting the user, oldest-staleness first. Drives "Research next N". */
export function pendingRows(rows: TriageRow[]): TriageRow[] {
  return rankRows(rows).filter((r) => r.disposition.verdict === 'pending');
}

/** Pending rows with no suggestion yet — the ones a research batch should take. */
export function unresearchedRows(rows: TriageRow[]): TriageRow[] {
  return pendingRows(rows).filter((r) => r.suggestion === null);
}
