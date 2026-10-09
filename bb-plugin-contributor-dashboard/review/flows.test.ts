import { describe, expect, it } from "vitest";

import type { PullRequestWithActivity, TimelineItem } from "../mirror/github";
import { bucketsFor } from "../dashboard/period";

import { mergeFlows, reviewFlows } from "./flows";

// Three Monday-to-Monday weeks, drawn by week.
const BUCKETS = bucketsFor({ from: Date.parse("2026-09-07T00:00:00"), to: Date.parse("2026-09-28T00:00:00") }, "week");
const NOW = Date.parse("2026-09-30T12:00:00");

function pr(overrides: Partial<PullRequestWithActivity>): PullRequestWithActivity {
  return {
    id: "PR_1",
    number: 1,
    title: "fix: widgets",
    url: "https://github.com/acme/widgets/pull/1",
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-08T09:00:00",
    updatedAt: "2026-09-08T09:00:00",
    closedAt: null,
    mergedAt: null,
    assignees: [],
    author: { login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

const asked = (createdAt: string, login = "hubber"): TimelineItem => ({
  __typename: "ReviewRequestedEvent",
  id: `rr-${createdAt}-${login}`,
  createdAt,
  actor: { login: "octocat" },
  requestedReviewer: { __typename: "User", login },
});

const review = (submittedAt: string, login = "hubber") => ({
  id: `r-${submittedAt}-${login}`,
  state: "APPROVED" as const,
  submittedAt,
  createdAt: submittedAt,
  author: { login },
});

describe("mergeFlows", () => {
  it("follows each pull request from the week it opened to the week it merged", () => {
    const flows = mergeFlows(
      [
        pr({ mergedAt: "2026-09-09T09:00:00", state: "MERGED", closedAt: "2026-09-09T09:00:00" }),
        // Opened in the first week, merged in the second: bled over.
        pr({ mergedAt: "2026-09-15T09:00:00", state: "MERGED", closedAt: "2026-09-15T09:00:00" }),
        // Opened before the period, merged inside it.
        pr({ createdAt: "2026-09-01T09:00:00", mergedAt: "2026-09-16T09:00:00", state: "MERGED", closedAt: "2026-09-16T09:00:00" }),
        // Still open, a reviewer asked in the second week.
        pr({ createdAt: "2026-09-10T09:00:00", timelineItems: [asked("2026-09-15T09:00:00")] }),
        pr({ author: { __typename: "Bot", login: "dependabot" } }),
      ],
      BUCKETS,
      NOW,
    );
    expect(flows.started).toEqual([3, 0, 0]);
    expect(flows.finished).toEqual([1, 2, 0]);
    expect(flows.flows[0]).toEqual([1, 1, 0]);
    expect(flows.fromEarlier).toEqual([0, 1, 0]);
    // At the end of week one: the one that bled over, the one still open, and
    // the one from before the period.
    expect(flows.open).toEqual([3, 1, 1]);
    expect(flows.asked).toEqual([0, 1, 1]);
  });
});

describe("reviewFlows", () => {
  it("pairs each request with the review that answered it, and stops a withdrawn one waiting", () => {
    const flows = reviewFlows(
      [
        pr({
          timelineItems: [
            asked("2026-09-08T10:00:00"),
            asked("2026-09-08T10:00:00", "mona"),
            {
              __typename: "ReviewRequestRemovedEvent",
              id: "removed",
              createdAt: "2026-09-16T10:00:00",
              actor: { login: "octocat" },
              requestedReviewer: { __typename: "User", login: "mona" },
            },
          ],
          reviews: [review("2026-09-15T10:00:00")],
        }),
      ],
      BUCKETS,
      NOW,
    );
    expect(flows.started).toEqual([2, 0, 0]);
    expect(flows.finished).toEqual([0, 1, 0]);
    expect(flows.flows[0]).toEqual([0, 1, 0]);
    // Both wait past week one; mona's request is withdrawn in week two.
    expect(flows.open).toEqual([2, 0, 0]);
    expect(flows.median).toBeCloseTo(5);
  });
});
