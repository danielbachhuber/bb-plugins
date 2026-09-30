import { describe, expect, it } from "vitest";
import {
  REVIEW_RUNS,
  REVIEW_STAGES,
  flagsFor,
  runOf,
  sortReviews,
  stageOf,
  type ListedReview,
  type TierInputs,
} from "./tiers.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const inputs: TierInputs = { staleAfterDays: 2, now: NOW };

let nextNumber = 1;

function review(overrides: Partial<ListedReview> = {}): ListedReview {
  return {
    repo: "acme/widgets",
    number: nextNumber++,
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

const old = NOW - 3 * DAY;

describe("runOf", () => {
  it("puts a re-review in re-review, even with a thread", () => {
    expect(runOf(review({ state: "re-review" }), inputs)).toBe("re-review");
    expect(runOf(review({ state: "re-review", threadId: "thr_1" }), inputs)).toBe("re-review");
    expect(runOf(review({ state: "re-review", requestedAt: old }), inputs)).toBe("re-review");
  });

  it("puts one with a thread in reviewing, whether a draft or overdue", () => {
    expect(runOf(review({ threadId: "thr_1" }), inputs)).toBe("reviewing");
    expect(runOf(review({ threadId: "thr_1", isDraft: true }), inputs)).toBe("reviewing");
    expect(runOf(review({ threadId: "thr_1", requestedAt: old }), inputs)).toBe("reviewing");
  });

  it("puts a draft in drafts, re-review or overdue", () => {
    expect(runOf(review({ isDraft: true }), inputs)).toBe("drafts");
    expect(runOf(review({ isDraft: true, state: "re-review" }), inputs)).toBe("drafts");
    expect(runOf(review({ isDraft: true, requestedAt: old }), inputs)).toBe("drafts");
  });

  it("puts a request waited on for the setting's days in overdue", () => {
    expect(runOf(review({ requestedAt: NOW - 2 * DAY }), inputs)).toBe("overdue");
    expect(runOf(review({ requestedAt: NOW - 2 * DAY + HOUR }), inputs)).toBe("to-review");
    expect(runOf(review({ requestedAt: old }), { ...inputs, staleAfterDays: 7 })).toBe("to-review");
  });

  it("puts every other request in to review", () => {
    expect(runOf(review(), inputs)).toBe("to-review");
  });
});

describe("stageOf", () => {
  it("puts a re-review in Re-review, a thread in Reviewing, and the rest in Requested", () => {
    expect(REVIEW_STAGES).toEqual(["Requested", "Reviewing", "Re-review"]);
    expect(stageOf(review({ state: "re-review", threadId: "thr_1" }))).toBe(2);
    expect(stageOf(review({ state: "re-review" }))).toBe(2);
    expect(stageOf(review({ threadId: "thr_1" }))).toBe(1);
    expect(stageOf(review({ isDraft: true }))).toBe(0);
    expect(stageOf(review())).toBe(0);
  });
});

describe("flagsFor", () => {
  it("says how long an overdue request has waited", () => {
    expect(flagsFor(review({ requestedAt: NOW - 5 * DAY - HOUR }), inputs)).toEqual([
      { kind: "stale", text: "Waiting 5 days" },
    ]);
  });

  it("names a single day in the singular", () => {
    expect(flagsFor(review({ requestedAt: NOW - DAY - HOUR }), { ...inputs, staleAfterDays: 1 })).toEqual([
      { kind: "stale", text: "Waiting 1 day" },
    ]);
  });

  it("flags nothing outside the overdue run, however old", () => {
    expect(flagsFor(review(), inputs)).toEqual([]);
    expect(flagsFor(review({ requestedAt: old, state: "re-review" }), inputs)).toEqual([]);
    expect(flagsFor(review({ requestedAt: old, threadId: "thr_1" }), inputs)).toEqual([]);
    expect(flagsFor(review({ requestedAt: old, isDraft: true }), inputs)).toEqual([]);
  });
});

describe("sortReviews", () => {
  it("puts the oldest request first within a run, then repository and number", () => {
    const newer = review({ title: "newer", requestedAt: NOW - 2 * HOUR });
    const older = review({ title: "older", requestedAt: NOW - 9 * HOUR });
    const gadgets = review({ title: "gadgets", repo: "acme/gadgets", number: 9, requestedAt: NOW - 2 * HOUR });
    expect(sortReviews([newer, older, gadgets], inputs).map((row) => row.title)).toEqual([
      "older",
      "gadgets",
      "newer",
    ]);
  });

  it("lists rows in the order of the runs, so a filtered list keeps its order", () => {
    const rows = [
      review({ isDraft: true }),
      review(),
      review({ threadId: "thr_1" }),
      review({ requestedAt: old }),
      review({ state: "re-review" }),
    ];
    const order = REVIEW_RUNS.map((run) => run.id);
    const runs = sortReviews(rows, inputs).map((row) => order.indexOf(runOf(row, inputs)));
    expect(runs).toEqual([...runs].sort((a, b) => a - b));
    expect(new Set(runs).size).toBe(REVIEW_RUNS.length);
  });
});

describe("REVIEW_RUNS", () => {
  it("has the runs, colours, and tiers the spec names, in list order", () => {
    expect(REVIEW_RUNS.map(({ id, tone, tier }) => [id, tone, tier])).toEqual([
      ["re-review", "new", "now"],
      ["overdue", "late", "now"],
      ["reviewing", "underway", "now"],
      ["to-review", "next", "next"],
      ["drafts", "later", "later"],
    ]);
  });

  it("names each run in the singular for a run of one", () => {
    for (const run of REVIEW_RUNS) expect(run.labelOne).not.toBe("");
  });
});
