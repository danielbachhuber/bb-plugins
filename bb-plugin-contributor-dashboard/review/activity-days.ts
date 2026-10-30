// What one person did on each day of a period, by kind, for the strips at the
// top of their page. Pure: reads stored GitHub objects, makes no calls.
import type { IssueWithActivity, PullRequestWithActivity } from "../mirror/github.js";

import { countedReviews, localDay } from "./reviews.js";

export const ACTIVITY_KINDS = ["opened", "merged", "reviewed", "issuesOpened", "issuesClosed"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface ActivityDay {
  /** Local midnight, epoch ms. */
  start: number;
  opened: number;
  merged: number;
  reviewed: number;
  issuesOpened: number;
  issuesClosed: number;
}

/**
 * One entry per local day from `start` up to `end`, counting:
 *
 * - pull requests they opened, and those that merged, by when each happened
 * - reviews they gave on other people's pull requests, once per pull request
 *   per day, as the Reviews chart counts them
 * - issues they opened
 * - issues assigned to them that closed. GitHub does not record who closed
 *   an issue, so this is the same count as the summary line's.
 */
export function activityDays(
  prs: readonly PullRequestWithActivity[],
  issues: readonly IssueWithActivity[],
  login: string,
  start: number,
  end: number,
): ActivityDay[] {
  const days: ActivityDay[] = [];
  const index = new Map<string, number>();
  for (const day = new Date(start); day.getTime() < end; day.setDate(day.getDate() + 1)) {
    day.setHours(0, 0, 0, 0);
    index.set(localDay(day.toISOString()), days.length);
    days.push({ start: day.getTime(), opened: 0, merged: 0, reviewed: 0, issuesOpened: 0, issuesClosed: 0 });
  }
  const add = (kind: ActivityKind, at: string | null) => {
    if (at === null) return;
    const i = index.get(localDay(at));
    if (i !== undefined) days[i][kind] += 1;
  };

  for (const pr of prs) {
    if (pr.author?.login === login) {
      add("opened", pr.createdAt);
      add("merged", pr.mergedAt);
    }
    const seen = new Set<string>();
    for (const review of countedReviews(pr)) {
      if (review.author!.login !== login) continue;
      const day = localDay(review.submittedAt!);
      if (seen.has(day)) continue;
      seen.add(day);
      add("reviewed", review.submittedAt);
    }
  }
  for (const issue of issues) {
    if (issue.author?.login === login) add("issuesOpened", issue.createdAt);
    if (issue.state === "CLOSED" && issue.assignees.some((who) => who.login === login)) add("issuesClosed", issue.closedAt);
  }
  return days;
}
