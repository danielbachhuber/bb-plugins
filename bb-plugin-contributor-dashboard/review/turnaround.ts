// How long pull requests took to merge, and reviews took to come, per bucket
// of a period: the time charts at the top of the two velocity sections.
//
// Time to merge runs from ready for review to merged, as a person's page
// counts it. Time to review is the Code review step: from a reviewer being
// asked to their review. Both are business days, and both are counted in the
// bucket they ended in.
import { isBot, type PullRequestWithActivity } from "../mirror/github.js";
import { bucketIndex, type Bucket } from "../dashboard/period.js";

import { businessDaysBetween } from "./business-time.js";
import { readyAt } from "./person.js";
import { percentilesOf, stageSpans } from "./stages.js";

export interface Turnaround {
  /** How many ended in the period. */
  count: number;
  median: number;
  p75: number;
  p90: number;
  /** The same for each bucket; median and p90 are 0 where nothing ended. */
  buckets: Array<{ count: number; median: number; p90: number }>;
}

function turnaroundOf(ended: ReadonlyArray<{ at: number; days: number }>, buckets: readonly Bucket[]): Turnaround {
  const per = buckets.map(() => [] as number[]);
  const all: number[] = [];
  for (const { at, days } of ended) {
    const index = bucketIndex(buckets, at);
    if (index < 0) continue;
    per[index].push(days);
    all.push(days);
  }
  return {
    count: all.length,
    ...percentilesOf(all),
    buckets: per.map((days) => {
      const marks = percentilesOf(days);
      return { count: days.length, median: marks.median, p90: marks.p90 };
    }),
  };
}

/** Ready for review to merged, for people's pull requests that merged in the period. Bots are left out. */
export function mergeTimes(prs: readonly PullRequestWithActivity[], buckets: readonly Bucket[]): Turnaround {
  const ended: Array<{ at: number; days: number }> = [];
  for (const pr of prs) {
    if (pr.mergedAt === null || isBot(pr.author)) continue;
    // A merged pull request is not a draft, so it has a ready time.
    const ready = readyAt(pr);
    if (ready === null) continue;
    const at = Date.parse(pr.mergedAt);
    ended.push({ at, days: businessDaysBetween(Date.parse(ready), at) });
  }
  return turnaroundOf(ended, buckets);
}

/** A reviewer asked to their review, for reviews that came in the period: the Code review step. */
export function reviewTimes(prs: readonly PullRequestWithActivity[], buckets: readonly Bucket[], now: number): Turnaround {
  const ended = stageSpans("review", { pullRequests: prs, issues: [] }, now)
    .filter((span) => span.endedAt !== null)
    .map((span) => ({ at: Date.parse(span.endedAt!), days: span.days }));
  return turnaroundOf(ended, buckets);
}
