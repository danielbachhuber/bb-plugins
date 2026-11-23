// The repository's open milestones: how far along each is, and whether issues
// are being added to it faster than they close. One milestone's page adds
// where each open issue stands and the milestone's whole history.
//
// The open and closed totals are GitHub's own counts. Everything that needs
// dates, such as what was added or closed in a period, reads the mirrored
// issues, which reach back to the mirror's horizon.
import type { Bucket } from "../dashboard/period.js";
import type { IssueWithActivity, Milestone, PullRequestWithActivity } from "../mirror/github.js";

import { countedReviews } from "./reviews.js";

export interface MilestoneSummary {
  number: number;
  title: string;
  url: string;
  /** Epoch ms; null when it has no due date. */
  due: number | null;
  open: number;
  closed: number;
  /** Open issues in it with nobody assigned. */
  nobody: number;
  /** Issues added to it in each bucket. */
  added: number[];
  /** Issues in it that closed in each bucket. */
  closedIn: number[];
  /** Open issues that were added during the period. */
  openAdded: number;
}

/** Where an open issue stands, from nobody on it to a pull request approved. */
export type IssueStanding = "nobody" | "assigned" | "draft" | "review" | "approved";

export const STANDINGS: readonly IssueStanding[] = ["nobody", "assigned", "draft", "review", "approved"];

export interface MilestoneIssue {
  number: number;
  title: string;
  url: string;
  assignees: string[];
  standing: IssueStanding;
  /** When it joined the milestone, epoch ms. */
  addedAt: number;
}

export interface ClosedMilestoneIssue {
  number: number;
  title: string;
  url: string;
  assignees: string[];
  closedAt: number;
  /** Closed as not planned or a duplicate, rather than done. */
  notDone: boolean;
}

export interface MilestoneHistory {
  /** Epoch ms of each point, oldest first. */
  at: number[];
  /** Issues in the milestone at each point. */
  total: number[];
  /** Of those, closed by each point. */
  closed: number[];
}

/**
 * When the issue joined its milestone: the last time it was put in one with
 * this title, or in any, for a row whose events predate the title. An issue
 * created straight into a milestone has no event before its creation, so its
 * creation stands in.
 */
export function addedAt(issue: IssueWithActivity, title: string): number {
  const events = issue.timelineItems.filter((item) => item.__typename === "MilestonedEvent");
  const named = events.filter((item) => "milestoneTitle" in item && item.milestoneTitle === title);
  const pool = named.length > 0 ? named : events.filter((item) => !("milestoneTitle" in item) || item.milestoneTitle === undefined);
  const last = pool.reduce<number | null>((max, item) => Math.max(max ?? 0, Date.parse(item.createdAt)), null);
  return last ?? Date.parse(issue.createdAt);
}

const inMilestone = (issues: readonly IssueWithActivity[], number: number) =>
  issues.filter((issue) => issue.milestone?.number === number);

const bucketOf = (buckets: readonly Bucket[], at: number) => buckets.findIndex((bucket) => at >= bucket.start && at < bucket.end);

/**
 * Most active first: the most issues added and closed in the period. Ties go
 * to the one due soonest, then to the one with the most open.
 */
function order(a: MilestoneSummary, b: MilestoneSummary): number {
  const moved = (m: MilestoneSummary) => m.added.reduce((x, y) => x + y, 0) + m.closedIn.reduce((x, y) => x + y, 0);
  const due = (m: MilestoneSummary) => m.due ?? Number.POSITIVE_INFINITY;
  return moved(b) - moved(a) || due(a) - due(b) || b.open - a.open || a.number - b.number;
}

export function milestoneSummaries(
  milestones: readonly Milestone[],
  issues: readonly IssueWithActivity[],
  buckets: readonly Bucket[],
): MilestoneSummary[] {
  const start = buckets[0]?.start ?? 0;
  return milestones
    .map((milestone) => {
      const added = buckets.map(() => 0);
      const closedIn = buckets.map(() => 0);
      let nobody = 0;
      let openAdded = 0;
      for (const issue of inMilestone(issues, milestone.number)) {
        const joined = addedAt(issue, milestone.title);
        const at = bucketOf(buckets, joined);
        if (at >= 0) added[at] += 1;
        if (issue.state === "OPEN") {
          if (issue.assignees.length === 0) nobody += 1;
          if (joined >= start) openAdded += 1;
        } else if (issue.closedAt !== null) {
          const closed = bucketOf(buckets, Date.parse(issue.closedAt));
          if (closed >= 0) closedIn[closed] += 1;
        }
      }
      return {
        number: milestone.number,
        title: milestone.title,
        url: milestone.url,
        due: milestone.dueOn === null ? null : Date.parse(milestone.dueOn),
        open: milestone.openIssues.totalCount,
        closed: milestone.closedIssues.totalCount,
        nobody,
        added,
        closedIn,
        openAdded,
      };
    })
    .sort(order);
}

/** Each reviewer's latest say: approved when someone approved and nobody's latest asks for changes. */
function approved(pr: PullRequestWithActivity): boolean {
  const latest = new Map<string, string>();
  for (const review of countedReviews(pr)) {
    if (review.state === "APPROVED" || review.state === "CHANGES_REQUESTED") latest.set(review.author!.login, review.state);
  }
  const says = [...latest.values()];
  return says.includes("APPROVED") && !says.includes("CHANGES_REQUESTED");
}

/** The furthest an open pull request that closes the issue has got; otherwise whether anyone holds it. */
export function standingOf(issue: IssueWithActivity, openPullRequests: readonly PullRequestWithActivity[]): IssueStanding {
  let best = -1;
  for (const pr of openPullRequests) {
    if (!pr.closingIssuesReferences?.some((ref) => ref.number === issue.number)) continue;
    const standing: IssueStanding = pr.isDraft ? "draft" : approved(pr) ? "approved" : "review";
    best = Math.max(best, STANDINGS.indexOf(standing));
  }
  if (best >= 0) return STANDINGS[best];
  return issue.assignees.length > 0 ? "assigned" : "nobody";
}

/** At most this many points on the history, however old the milestone. */
const HISTORY_POINTS = 40;
const WEEK = 7 * 86_400_000;

export function milestoneDetail(
  milestone: Milestone,
  issues: readonly IssueWithActivity[],
  pullRequests: readonly PullRequestWithActivity[],
  now: number,
): { open: MilestoneIssue[]; closed: ClosedMilestoneIssue[]; history: MilestoneHistory } {
  const mine = inMilestone(issues, milestone.number);
  const openPullRequests = pullRequests.filter((pr) => pr.state === "OPEN");
  const joined = new Map(mine.map((issue) => [issue.number, addedAt(issue, milestone.title)]));
  const open = mine
    .filter((issue) => issue.state === "OPEN")
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      assignees: issue.assignees.map((who) => who.login),
      standing: standingOf(issue, openPullRequests),
      addedAt: joined.get(issue.number)!,
    }))
    .sort((a, b) => STANDINGS.indexOf(b.standing) - STANDINGS.indexOf(a.standing) || b.addedAt - a.addedAt);
  const closed = mine
    .filter((issue) => issue.state === "CLOSED" && issue.closedAt !== null)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      assignees: issue.assignees.map((who) => who.login),
      closedAt: Date.parse(issue.closedAt!),
      notDone: issue.stateReason === "NOT_PLANNED" || issue.stateReason === "DUPLICATE",
    }))
    .sort((a, b) => b.closedAt - a.closedAt);

  // A week a point, from the milestone's creation or its first issue, spread
  // wider for an old milestone so the chart keeps a readable number of points.
  const first = Math.min(Date.parse(milestone.createdAt), ...joined.values());
  const step = Math.max(WEEK, Math.ceil((now - first) / HISTORY_POINTS / WEEK) * WEEK);
  const at: number[] = [];
  for (let t = now; t > first; t -= step) at.unshift(t);
  at.unshift(first);
  const history: MilestoneHistory = {
    at,
    total: at.map((t) => mine.filter((issue) => joined.get(issue.number)! <= t).length),
    closed: at.map((t) => closed.filter((issue) => issue.closedAt <= t).length),
  };
  return { open, closed, history };
}
