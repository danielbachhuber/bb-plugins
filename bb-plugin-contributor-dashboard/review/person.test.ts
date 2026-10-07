import { describe, expect, it } from "vitest";

import type { PullRequestReview, PullRequestWithActivity, TimelineItem } from "../mirror/github";
import { authoredPullRequests, awaitingReview, readyAt } from "./person";

const NOW = Date.parse("2026-09-18T12:00:00Z"); // a Friday

function review(login: string, submittedAt: string, state: PullRequestReview["state"] = "APPROVED"): PullRequestReview {
  return { id: `R_${login}_${submittedAt}`, state, submittedAt, createdAt: submittedAt, author: { __typename: "User", login } };
}

function requested(login: string, createdAt: string): TimelineItem {
  return {
    __typename: "ReviewRequestedEvent",
    id: `E_${login}_${createdAt}`,
    createdAt,
    actor: { login: "octocat" },
    requestedReviewer: { __typename: "User", login },
  };
}

function unrequested(login: string, createdAt: string): TimelineItem {
  return {
    __typename: "ReviewRequestRemovedEvent",
    id: `X_${login}_${createdAt}`,
    createdAt,
    actor: { login: "octocat" },
    requestedReviewer: { __typename: "User", login },
  };
}

function pr(overrides: Partial<PullRequestWithActivity> = {}): PullRequestWithActivity {
  return {
    id: "PR_1",
    number: 1840,
    title: "Add retry to widget sync",
    url: "https://github.com/acme/widgets/pull/1840",
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-14T09:00:00Z", // Monday
    updatedAt: "2026-09-16T09:00:00Z",
    closedAt: null,
    mergedAt: null,
    author: { __typename: "User", login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

describe("readyAt", () => {
  it("is when the pull request opened, with no draft in its history", () => {
    expect(readyAt(pr())).toBe("2026-09-14T09:00:00Z");
  });

  it("is when it left draft, when it has been a draft", () => {
    const item: TimelineItem = {
      __typename: "ReadyForReviewEvent",
      id: "RFR_1",
      createdAt: "2026-09-15T09:00:00Z",
      actor: { login: "octocat" },
    };
    expect(readyAt(pr({ timelineItems: [item] }))).toBe("2026-09-15T09:00:00Z");
  });

  it("is null while it is still a draft", () => {
    expect(readyAt(pr({ isDraft: true }))).toBeNull();
  });
});

describe("awaitingReview", () => {
  it("lists an open pull request whose review request to them is unanswered", () => {
    const [row] = awaitingReview([pr({ timelineItems: [requested("hubber", "2026-09-16T09:00:00Z")] })], "hubber", NOW);
    expect(row.number).toBe(1840);
    expect(row.author).toBe("octocat");
    expect(row.requestedAt).toBe("2026-09-16T09:00:00Z");
    expect(row.waitingDays).toBeCloseTo(2.125, 3);
  });

  it("leaves out a request they have already reviewed", () => {
    const item = pr({
      timelineItems: [requested("hubber", "2026-09-16T09:00:00Z")],
      reviews: [review("hubber", "2026-09-17T09:00:00Z")],
    });
    expect(awaitingReview([item], "hubber", NOW)).toEqual([]);
  });

  it("lists it again when they are re-requested after reviewing", () => {
    const item = pr({
      timelineItems: [requested("hubber", "2026-09-15T09:00:00Z"), requested("hubber", "2026-09-17T12:00:00Z")],
      reviews: [review("hubber", "2026-09-16T09:00:00Z", "CHANGES_REQUESTED")],
    });
    expect(awaitingReview([item], "hubber", NOW).map((row) => row.requestedAt)).toEqual(["2026-09-17T12:00:00Z"]);
  });

  it("leaves out a request that was withdrawn", () => {
    const item = pr({
      timelineItems: [requested("hubber", "2026-09-15T09:00:00Z"), unrequested("hubber", "2026-09-16T09:00:00Z")],
    });
    expect(awaitingReview([item], "hubber", NOW)).toEqual([]);
  });

  it("leaves out requests to other people, and closed, merged, or draft pull requests", () => {
    const items = [
      pr({ id: "a", number: 1, timelineItems: [requested("mona", "2026-09-16T09:00:00Z")] }),
      pr({ id: "b", number: 2, state: "MERGED", mergedAt: "2026-09-17T09:00:00Z", timelineItems: [requested("hubber", "2026-09-16T09:00:00Z")] }),
      pr({ id: "c", number: 3, state: "CLOSED", timelineItems: [requested("hubber", "2026-09-16T09:00:00Z")] }),
      pr({ id: "d", number: 4, isDraft: true, timelineItems: [requested("hubber", "2026-09-16T09:00:00Z")] }),
    ];
    expect(awaitingReview(items, "hubber", NOW)).toEqual([]);
  });

  it("puts the longest wait first", () => {
    const items = [
      pr({ id: "a", number: 1, timelineItems: [requested("hubber", "2026-09-17T09:00:00Z")] }),
      pr({ id: "b", number: 2, timelineItems: [requested("hubber", "2026-09-15T09:00:00Z")] }),
    ];
    expect(awaitingReview(items, "hubber", NOW).map((row) => row.number)).toEqual([2, 1]);
  });
});

describe("authoredPullRequests", () => {
  const since = Date.parse("2026-09-01T00:00:00Z");

  it("reports time to first review, follow-ups, and time to merge", () => {
    const item = pr({
      state: "MERGED",
      mergedAt: "2026-09-17T09:00:00Z",
      reviews: [
        review("hubber", "2026-09-15T09:00:00Z", "CHANGES_REQUESTED"),
        review("hubber", "2026-09-16T09:00:00Z"),
        review("mona", "2026-09-16T15:00:00Z"),
      ],
    });
    const [row] = authoredPullRequests([item], "octocat", since, NOW);
    expect(row.firstReviewDays).toBeCloseTo(1, 5);
    expect(row.followUps).toBe(2);
    expect(row.mergeDays).toBeCloseTo(3, 5);
    expect(row.waitingDays).toBeNull();
  });

  it("counts one person's reviews on one day as one follow-up", () => {
    const item = pr({
      reviews: [
        review("hubber", "2026-09-15T09:00:00Z", "COMMENTED"),
        review("hubber", "2026-09-16T09:00:00Z", "COMMENTED"),
        review("hubber", "2026-09-16T09:05:00Z", "COMMENTED"),
        review("hubber", "2026-09-16T16:00:00Z", "APPROVED"),
      ],
    });
    expect(authoredPullRequests([item], "octocat", since, NOW)[0].followUps).toBe(1);
  });

  it("says how long an open pull request has waited, with no review yet", () => {
    const [row] = authoredPullRequests([pr()], "octocat", since, NOW);
    expect(row.firstReviewDays).toBeNull();
    expect(row.followUps).toBe(0);
    expect(row.mergeDays).toBeNull();
    expect(row.waitingDays).toBeCloseTo(4.125, 3);
  });

  it("ignores the author's own reviews and bots", () => {
    const item = pr({
      reviews: [
        review("octocat", "2026-09-15T09:00:00Z", "COMMENTED"),
        { id: "R_bot", state: "COMMENTED", submittedAt: "2026-09-15T10:00:00Z", createdAt: "2026-09-15T10:00:00Z", author: { __typename: "Bot", login: "copilot" } },
      ],
    });
    expect(authoredPullRequests([item], "octocat", since, NOW)[0].firstReviewDays).toBeNull();
  });

  it("leaves out other people's pull requests and ones untouched in the period", () => {
    const items = [
      pr({ id: "a", number: 1, author: { __typename: "User", login: "mona" } }),
      pr({ id: "b", number: 2, updatedAt: "2026-08-01T09:00:00Z" }),
    ];
    expect(authoredPullRequests(items, "octocat", since, NOW)).toEqual([]);
  });

  it("puts the newest pull request first", () => {
    const items = [
      pr({ id: "a", number: 1, createdAt: "2026-09-10T09:00:00Z" }),
      pr({ id: "b", number: 2, createdAt: "2026-09-16T09:00:00Z" }),
    ];
    expect(authoredPullRequests(items, "octocat", since, NOW).map((row) => row.number)).toEqual([2, 1]);
  });
});
