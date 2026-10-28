// The open issues one person holds, and when each reached the steps before it
// became theirs: opened, planned, assigned. Pure: reads stored GitHub objects,
// makes no calls.
import type { IssueWithActivity } from "../mirror/github.js";

export interface AssignedIssueRow {
  number: number;
  title: string;
  url: string;
  /** Who opened it, or null when GitHub could not name them. */
  author: string | null;
  openedAt: string;
  /** When it first reached a milestone or project; null when it never did. */
  plannedAt: string | null;
  /** When it was last assigned to them. */
  assignedAt: string;
  /** GitHub's last change to the issue: a comment, an edit, an event. */
  updatedAt: string;
}

/** When the issue was first planned: put in a milestone, or added to a project. */
function plannedAt(issue: IssueWithActivity): string | null {
  const planned = issue.timelineItems.find(
    (item) => item.__typename === "MilestonedEvent" || item.__typename === "AddedToProjectV2Event",
  );
  return planned?.createdAt ?? null;
}

/**
 * Every open issue assigned to `login` now, longest held first. Held from the
 * last time it was assigned to them, since an issue handed back and taken
 * again has been theirs only since then. An issue assigned before the mirror
 * kept its events counts from when it was opened.
 */
export function assignedIssues(issues: readonly IssueWithActivity[], login: string): AssignedIssueRow[] {
  return issues
    .filter((issue) => issue.state === "OPEN" && issue.assignees.some((who) => who.login === login))
    .map((issue) => {
      const assigned = issue.timelineItems
        .filter((item) => item.__typename === "AssignedEvent" && item.assignee?.login === login)
        .at(-1);
      return {
        number: issue.number,
        title: issue.title,
        url: issue.url,
        author: issue.author?.login ?? null,
        openedAt: issue.createdAt,
        plannedAt: plannedAt(issue),
        assignedAt: assigned?.createdAt ?? issue.createdAt,
        updatedAt: issue.updatedAt,
      };
    })
    .sort((a, b) => Date.parse(a.assignedAt) - Date.parse(b.assignedAt) || a.number - b.number);
}

/**
 * How many issues assigned to `login` closed in [start, end). GitHub's close
 * event names no one, so this counts issues closed while theirs, not issues
 * they closed.
 */
export function closedAssignedIssues(
  issues: readonly IssueWithActivity[],
  login: string,
  start: number,
  end: number,
): number {
  return issues.filter((issue) => {
    if (issue.state !== "CLOSED" || issue.closedAt === null) return false;
    const closed = Date.parse(issue.closedAt);
    return closed >= start && closed < end && issue.assignees.some((who) => who.login === login);
  }).length;
}
