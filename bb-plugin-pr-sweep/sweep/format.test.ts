import { describe, expect, it } from "vitest";
import { checksLabel, factsFor, relativeTime, reviewFacts } from "./format.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const GREEN = { pass: 4, fail: 0, skip: 1, pending: 0, cancelled: 0, total: 5 };

function review(overrides: Partial<Parameters<typeof reviewFacts>[0]> = {}) {
  return {
    approvedBy: [],
    waitingOn: [],
    awaitingReReview: false,
    unresolvedThreads: 0,
    outdatedThreads: 0,
    notedBy: [],
    lastCommentBy: null,
    ...overrides,
  };
}

describe("relativeTime", () => {
  it("rounds every unit down", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 3 * HOUR - 1, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe("2d ago");
    expect(relativeTime(NOW - 15 * DAY, NOW)).toBe("2w ago");
  });
});

describe("checksLabel", () => {
  it("leads with the counts that matter and leaves out zeroes", () => {
    expect(checksLabel({ pass: 7, fail: 2, skip: 0, pending: 1, cancelled: 0, total: 10 })).toBe(
      "2 fail, 1 running, 7 pass",
    );
  });

  it("says so when there are no checks", () => {
    expect(checksLabel({ pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 0 })).toBe("no checks");
  });
});

describe("reviewFacts", () => {
  it("names approvals and outstanding reviewers together", () => {
    expect(reviewFacts(review({ approvedBy: ["hubber"], waitingOn: ["octocat"] }))).toEqual([
      "approved by hubber",
      "waiting on octocat",
    ]);
  });

  it("names the comments an approval can hide", () => {
    expect(
      reviewFacts(review({ unresolvedThreads: 3, outdatedThreads: 1, notedBy: ["hubber"], lastCommentBy: "octocat" })),
    ).toEqual(["3 unresolved comments, 1 outdated", "notes from hubber", "octocat commented last"]);
    expect(reviewFacts(review({ unresolvedThreads: 1 }))).toEqual(["1 unresolved comment"]);
  });

  it("says a re-review is pending", () => {
    expect(reviewFacts(review({ awaitingReReview: true }))).toEqual(["awaiting re-review"]);
  });

  it("says so when there are no reviews at all", () => {
    expect(reviewFacts(review())).toEqual(["no reviews yet"]);
  });
});

describe("factsFor", () => {
  const row = { ...review({ waitingOn: ["hubber"] }), repo: "acme/gadgets", updatedAt: NOW - 3 * HOUR, checks: GREEN };

  it("puts the age first, since a Later row shows only the first fact", () => {
    expect(factsFor(row, NOW, false)).toEqual(["3h ago", "4 pass, 1 skip", "waiting on hubber"]);
  });

  it("names the repository only when asked to", () => {
    expect(factsFor(row, NOW, true)).toEqual(["3h ago", "acme/gadgets", "4 pass, 1 skip", "waiting on hubber"]);
  });
});
