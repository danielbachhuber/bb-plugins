// What arrived and what finished in each bucket of a period, and which bucket
// each arrival finished in: the charts that open the two velocity sections.
//
// For pull requests an arrival is opening one and a finish is merging it. For
// reviews an arrival is a review request and a finish is the review that
// answers it. A finish in a later bucket than its arrival is work that bled
// over; a finish whose arrival came before the period started is counted
// apart, so every finished bar is whole.
import { isBot, type PullRequestWithActivity } from "../mirror/github.js";
import { bucketIndex, type Bucket } from "../dashboard/period.js";

import { businessDaysBetween } from "./business-time.js";
import { isRequestEvent, teamRequestWinner } from "./people.js";
import { readyAt } from "./person.js";
import { countedReviews } from "./reviews.js";
import { percentilesOf } from "./stages.js";

export interface BucketFlows {
  /** Arrivals in each bucket. */
  started: number[];
  /** Finishes in each bucket, whenever they arrived. */
  finished: number[];
  /** `flows[i][j]`: arrived in bucket i and finished in bucket j. */
  flows: number[][];
  /** Finishes in each bucket that arrived before the period. */
  fromEarlier: number[];
  /** Still unfinished when each bucket ended, or now for the bucket under way. */
  open: number[];
  /** Of those, how many had a reviewer asked: pull requests only. */
  asked: number[] | null;
  /** Business days from arrival to finish, for what finished in the period. */
  median: number;
  p90: number;
}

interface Item {
  start: number;
  end: number | null;
  /** When it stopped counting as open without finishing: closed, or withdrawn. */
  gone: number | null;
  /** When a reviewer was first asked, for a pull request. */
  asked?: number | null;
  days: number | null;
}

function tally(items: readonly Item[], buckets: readonly Bucket[], now: number, withAsked: boolean): BucketFlows {
  const zero = () => buckets.map(() => 0);
  const flows = buckets.map(() => zero());
  const out: BucketFlows = {
    started: zero(),
    finished: zero(),
    flows,
    fromEarlier: zero(),
    open: zero(),
    asked: withAsked ? zero() : null,
    median: 0,
    p90: 0,
  };
  const durations: number[] = [];
  for (const item of items) {
    const from = bucketIndex(buckets, item.start);
    if (from >= 0) out.started[from] += 1;
    if (item.end !== null) {
      const to = bucketIndex(buckets, item.end);
      if (to >= 0) {
        out.finished[to] += 1;
        if (from >= 0) flows[from][to] += 1;
        else out.fromEarlier[to] += 1;
        if (item.days !== null) durations.push(item.days);
      }
    }
    buckets.forEach((bucket, index) => {
      const end = Math.min(bucket.end, now);
      const stillOpen = item.start < end && (item.end === null || item.end >= end) && (item.gone === null || item.gone >= end);
      if (!stillOpen) return;
      out.open[index] += 1;
      if (out.asked !== null && item.asked != null && item.asked < end) out.asked[index] += 1;
    });
  }
  const marks = percentilesOf(durations);
  return { ...out, median: marks.median, p90: marks.p90 };
}

/** Pull requests opened and merged. Bots are left out. The time is from ready for review to merged. */
export function mergeFlows(prs: readonly PullRequestWithActivity[], buckets: readonly Bucket[], now: number): BucketFlows {
  const items: Item[] = [];
  for (const pr of prs) {
    if (isBot(pr.author)) continue;
    const merged = pr.mergedAt === null ? null : Date.parse(pr.mergedAt);
    const ready = readyAt(pr);
    const asked = pr.timelineItems.find((item) => item.__typename === "ReviewRequestedEvent");
    items.push({
      start: Date.parse(pr.createdAt),
      end: merged,
      gone: merged === null && pr.closedAt !== null ? Date.parse(pr.closedAt) : null,
      asked: asked === undefined ? null : Date.parse(asked.createdAt),
      days: merged === null || ready === null ? null : businessDaysBetween(Date.parse(ready), merged),
    });
  }
  return tally(items, buckets, now, true);
}

/**
 * Review requests and the reviews that answered them, paired as the
 * per-person counts pair them: a request made of a person is answered by
 * their next review; one made of a team counts for whoever picked it up, and
 * one nobody picked up counts for no one. A request withdrawn, or on a pull
 * request that closed, stops waiting without being answered.
 */
export function reviewFlows(prs: readonly PullRequestWithActivity[], buckets: readonly Bucket[], now: number): BucketFlows {
  const items: Item[] = [];
  for (const pr of prs) {
    const reviews = countedReviews(pr);
    const events = pr.timelineItems.filter(isRequestEvent);
    const closed = pr.closedAt === null ? null : Date.parse(pr.closedAt);
    for (const event of events) {
      if (event.__typename !== "ReviewRequestedEvent" || event.requestedReviewer === null) continue;
      const reviewer = event.requestedReviewer;
      const login = "slug" in reviewer ? teamRequestWinner(event, events, reviews) : isBot(reviewer) ? null : reviewer.login;
      if (login === null) continue;
      const answer = reviews.find((review) => review.author!.login === login && review.submittedAt! > event.createdAt);
      const withdrawn = events.find(
        (other) =>
          other.__typename === "ReviewRequestRemovedEvent" &&
          other.createdAt > event.createdAt &&
          other.requestedReviewer !== null &&
          "login" in other.requestedReviewer &&
          other.requestedReviewer.login === login,
      );
      const answered =
        answer !== undefined && (withdrawn === undefined || answer.submittedAt! < withdrawn.createdAt)
          ? Date.parse(answer.submittedAt!)
          : null;
      const start = Date.parse(event.createdAt);
      const gone = [withdrawn === undefined ? null : Date.parse(withdrawn.createdAt), closed]
        .filter((at): at is number => at !== null)
        .reduce<number | null>((first, at) => (first === null || at < first ? at : first), null);
      items.push({ start, end: answered, gone: answered === null ? gone : null, days: answered === null ? null : businessDaysBetween(start, answered) });
    }
  }
  return tally(items, buckets, now, false);
}
