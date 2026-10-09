import { describe, expect, it } from "vitest";

import type { PullRequestWithActivity } from "../mirror/github";
import { bucketsFor } from "../dashboard/period";

import { mergeTimes, reviewTimes } from "./turnaround";

// Four Monday-to-Monday weeks, drawn by week to keep the buckets few.
const BUCKETS = bucketsFor({ from: Date.parse("2026-09-07T00:00:00"), to: Date.parse("2026-10-05T00:00:00") }, "week");

function pr(overrides: Partial<PullRequestWithActivity>): PullRequestWithActivity {
  return {
    id: "PR_1",
    number: 1,
    title: "fix: widgets",
    url: "https://github.com/acme/widgets/pull/1",
    state: "MERGED",
    isDraft: false,
    createdAt: "2026-09-14T09:00:00",
    updatedAt: "2026-09-16T09:00:00",
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

describe("mergeTimes", () => {
  it("times ready to merged in business days, in the bucket it merged in, leaving bots out", () => {
    const result = mergeTimes(
      [
        // Monday 9:00 to Wednesday 9:00: two business days.
        pr({ mergedAt: "2026-09-16T09:00:00" }),
        // Friday to Monday: the weekend does not count.
        pr({ createdAt: "2026-09-18T09:00:00", mergedAt: "2026-09-21T09:00:00" }),
        pr({ mergedAt: "2026-09-16T09:00:00", author: { __typename: "Bot", login: "dependabot" } }),
        pr({ mergedAt: null, state: "OPEN" }),
      ],
      BUCKETS,
    );
    expect(result.count).toBe(2);
    expect(result.buckets.map((bucket) => bucket.count)).toEqual([0, 1, 1, 0]);
    expect(result.buckets[1].median).toBeCloseTo(2);
    expect(result.buckets[2].median).toBeCloseTo(1);
  });
});

describe("reviewTimes", () => {
  it("times a request to its review, in the bucket the review came in", () => {
    const result = reviewTimes(
      [
        pr({
          state: "OPEN",
          timelineItems: [
            {
              __typename: "ReviewRequestedEvent",
              id: "rr",
              createdAt: "2026-09-14T10:00:00",
              actor: { login: "octocat" },
              requestedReviewer: { __typename: "User", login: "hubber" },
            },
          ],
          reviews: [
            { id: "r", state: "APPROVED", submittedAt: "2026-09-15T10:00:00", createdAt: "2026-09-15T10:00:00", author: { login: "hubber" } },
          ],
        }),
      ],
      BUCKETS,
      Date.parse("2026-10-04T00:00:00"),
    );
    expect(result.count).toBe(1);
    expect(result.buckets[1]).toMatchObject({ count: 1 });
    expect(result.median).toBeCloseTo(1);
  });
});
