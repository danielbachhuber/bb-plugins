// What the pages draw, worked out from the stored milestones. No I/O.
import type {
  IssueStanding,
  MilestoneHistory,
  MilestoneSummary,
} from "@danielbachhuber/bb-plugin-component-library/milestones";

import type { StoredMilestone } from "./github.js";

export interface Bucket {
  start: number;
  end: number;
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** `weeks` week-long buckets, oldest first, the last ending now. */
export function weekBuckets(now: number, weeks: number): Bucket[] {
  return Array.from({ length: weeks }, (_, i) => {
    const start = now - (weeks - i) * WEEK;
    // The last one takes in now itself.
    return { start, end: i === weeks - 1 ? now + 1 : start + WEEK };
  });
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "six weeks", for "Over six weeks". */
export function periodWords(weeks: number): string {
  const count = NUMBER_WORDS[weeks] ?? String(weeks);
  return weeks === 1 ? "one week" : `${count} weeks`;
}

const bucketOf = (buckets: readonly Bucket[], at: number) => buckets.findIndex((bucket) => at >= bucket.start && at < bucket.end);

export function summarize(milestone: StoredMilestone, buckets: readonly Bucket[]): MilestoneSummary {
  const start = buckets[0]?.start ?? 0;
  const added = buckets.map(() => 0);
  const closedIn = buckets.map(() => 0);
  let nobody = 0;
  let openAdded = 0;
  for (const issue of milestone.issues) {
    const at = bucketOf(buckets, issue.addedAt);
    if (at >= 0) added[at] += 1;
    if (issue.open) {
      if (issue.assignees.length === 0) nobody += 1;
      if (issue.addedAt >= start) openAdded += 1;
    } else if (issue.closedAt !== null) {
      const closed = bucketOf(buckets, issue.closedAt);
      if (closed >= 0) closedIn[closed] += 1;
    }
  }
  return {
    number: milestone.number,
    title: milestone.title,
    url: milestone.url,
    due: milestone.due,
    open: milestone.open,
    closed: milestone.closed,
    nobody,
    added,
    closedIn,
    openAdded,
  };
}

/** Due soonest first; no due date last. Ties go to the most open, then the lowest number. */
export function byDue(a: MilestoneSummary, b: MilestoneSummary): number {
  const due = (m: MilestoneSummary) => m.due ?? Number.POSITIVE_INFINITY;
  return due(a) - due(b) || b.open - a.open || a.number - b.number;
}

export interface OpenIssue {
  number: number;
  title: string;
  url: string;
  assignees: string[];
  standing: IssueStanding;
  addedAt: number;
}

export interface ClosedIssue {
  number: number;
  title: string;
  url: string;
  assignees: string[];
  closedAt: number;
  notDone: boolean;
}

const STANDING_ORDER: readonly IssueStanding[] = ["nobody", "assigned", "draft", "review", "approved"];

/** At most this many points on the history, however old the milestone. */
const HISTORY_POINTS = 40;

export function detail(
  milestone: StoredMilestone,
  now: number,
): { open: OpenIssue[]; closed: ClosedIssue[]; history: MilestoneHistory } {
  const open = milestone.issues
    .filter((issue) => issue.open)
    .map(({ number, title, url, assignees, standing, addedAt }) => ({ number, title, url, assignees, standing, addedAt }))
    .sort((a, b) => STANDING_ORDER.indexOf(b.standing) - STANDING_ORDER.indexOf(a.standing) || b.addedAt - a.addedAt);
  const closed = milestone.issues
    .filter((issue) => !issue.open && issue.closedAt !== null)
    .map(({ number, title, url, assignees, closedAt, notDone }) => ({ number, title, url, assignees, closedAt: closedAt!, notDone }))
    .sort((a, b) => b.closedAt - a.closedAt);

  // A week a point, from the milestone's creation or its first issue, spread
  // wider for an old milestone so the chart keeps a readable number of points.
  const first = Math.min(milestone.createdAt, ...milestone.issues.map((issue) => issue.addedAt));
  const step = Math.max(WEEK, Math.ceil((now - first) / HISTORY_POINTS / WEEK) * WEEK);
  const at: number[] = [];
  for (let t = now; t > first; t -= step) at.unshift(t);
  at.unshift(first);
  const history: MilestoneHistory = {
    at,
    total: at.map((t) => milestone.issues.filter((issue) => issue.addedAt <= t).length),
    closed: at.map((t) => closed.filter((issue) => issue.closedAt <= t).length),
  };
  return { open, closed, history };
}
