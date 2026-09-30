import { describe, expect, it } from "vitest";
import { bannerFor, reviewersFor } from "./row-status.js";
import type { ListedReview, TierInputs } from "./tiers.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const inputs: TierInputs = { staleAfterDays: 2, now: NOW };

function review(overrides: Partial<ListedReview> = {}): ListedReview {
  return {
    repo: "acme/widgets",
    number: 1,
    title: "Cache widget thumbnails",
    url: "https://github.com/acme/widgets/pull/1",
    author: "octocat",
    isDraft: false,
    state: "first-look",
    requestedAt: NOW - 5 * HOUR,
    lastReviewedAt: null,
    requestedReviewers: ["you"],
    size: { additions: 18, deletions: 4, changedFiles: 2 },
    canSpawn: true,
    threadId: null,
    comments: 0,
    checks: { pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 0 },
    reviewers: [],
    note: null,
    newComments: 0,
    ...overrides,
  };
}

describe("bannerFor", () => {
  it("says how long a request past the setting has waited, in red", () => {
    expect(bannerFor(review({ requestedAt: NOW - 6 * DAY - HOUR }), inputs)).toEqual({
      tone: "blocked",
      text: "Waiting on you for 6 days",
    });
    expect(bannerFor(review({ requestedAt: NOW - DAY - HOUR }), { ...inputs, staleAfterDays: 1 })?.text).toBe(
      "Waiting on you for 1 day",
    );
  });

  it("says nothing of the wait once a thread or a draft explains the row", () => {
    const old = NOW - 6 * DAY;
    expect(bannerFor(review({ requestedAt: old, threadId: "thr_1" }), inputs)).toBeNull();
    expect(bannerFor(review({ requestedAt: old, isDraft: true }), inputs)).toBeNull();
  });

  it("says a re-review was asked for again, in blue", () => {
    expect(bannerFor(review({ state: "re-review", requestedAt: NOW - 6 * DAY }), inputs)).toEqual({
      tone: "info",
      text: "Asked to review again",
    });
  });

  it("draws no banner for a fresh first look", () => {
    expect(bannerFor(review(), inputs)).toBeNull();
  });
});

describe("reviewersFor", () => {
  it("gives a person their picture and a team its organization's", () => {
    const row = review({
      reviewers: [
        { login: "hubber", state: "approved", team: false },
        { login: "acme/reviewers", state: "pending", team: true },
      ],
    });
    expect(reviewersFor(row)).toEqual([
      { login: "hubber", state: "approved", team: false, avatarUrl: "https://github.com/hubber.png?size=40" },
      { login: "acme/reviewers", state: "pending", team: true, avatarUrl: "https://github.com/acme.png?size=40" },
    ]);
  });

  it("uses the picture source it is given", () => {
    const [reviewer] = reviewersFor(review({ reviewers: [{ login: "hubber", state: "commented", team: false }] }), (owner) => `drawn:${owner}`);
    expect(reviewer?.avatarUrl).toBe("drawn:hubber");
  });
});
