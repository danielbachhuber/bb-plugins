import { describe, expect, it } from "vitest";

import type { IssueWithActivity, PullRequestWithActivity } from "../mirror/github";

import {
  countIntoBands,
  percentilesOf,
  QUEUE_BANDS,
  SPREAD_BANDS,
  stageDetail,
  stageSpans,
  stageSummaries,
} from "./stages";

const NOW = Date.parse("2026-10-08T12:00:00Z");

const input = (pullRequests: PullRequestWithActivity[], issues: IssueWithActivity[] = []) => ({
  pullRequests,
  issues,
});

const spansOf = (stage: Parameters<typeof stageSpans>[0], prs: PullRequestWithActivity[], now = NOW) =>
  stageSpans(stage, input(prs), now);

function pr(overrides: Partial<PullRequestWithActivity> = {}): PullRequestWithActivity {
  return {
    id: "PR_1",
    number: 1,
    title: "Export widgets as CSV",
    url: "https://github.com/acme/widgets/pull/1",
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-10-05T09:00:00Z",
    updatedAt: "2026-10-07T09:00:00Z",
    closedAt: null,
    mergedAt: null,
    author: { login: "octocat" },
    reviews: [],
    timelineItems: [],
    ...overrides,
  };
}

const requested = (createdAt: string, login = "hubber") =>
  ({
    __typename: "ReviewRequestedEvent" as const,
    id: `rr-${createdAt}`,
    createdAt,
    actor: { login: "octocat" },
    requestedReviewer: { __typename: "User", login },
  });

const review = (submittedAt: string, state: "COMMENTED" | "APPROVED" = "COMMENTED", login = "hubber") => ({
  id: `r-${submittedAt}`,
  state,
  submittedAt,
  createdAt: submittedAt,
  author: { login },
});

describe("stageSpans", () => {
  it("times a draft from opening to ready for review", () => {
    const spans = spansOf(
      "implement",
      [
        pr({
          createdAt: "2026-10-05T09:00:00Z",
          timelineItems: [
            { __typename: "ReadyForReviewEvent", id: "rfr", createdAt: "2026-10-06T09:00:00Z", actor: null },
          ],
        }),
      ],
      NOW,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].endedAt).toBe("2026-10-06T09:00:00Z");
    expect(spans[0].days).toBeCloseTo(1, 5);
  });

  it("leaves out a pull request that opened ready for review", () => {
    expect(spansOf("implement", [pr()], NOW)).toEqual([]);
  });

  it("counts an open draft as still implementing", () => {
    const spans = spansOf("implement", [pr({ isDraft: true, createdAt: "2026-10-07T12:00:00Z" })], NOW);
    expect(spans[0].endedAt).toBeNull();
    expect(spans[0].days).toBeCloseTo(1, 5);
  });

  it("times preparing from ready to the first review request", () => {
    const spans = spansOf(
      "prepare",
      [pr({ createdAt: "2026-10-05T09:00:00Z", timelineItems: [requested("2026-10-05T15:00:00Z")] })],
      NOW,
    );
    expect(spans[0].days).toBeCloseTo(0.25, 5);
  });

  it("counts a ready pull request with no reviewer asked as still preparing", () => {
    const spans = spansOf("prepare", [pr({ createdAt: "2026-10-07T09:00:00Z" })], NOW);
    expect(spans[0].endedAt).toBeNull();
  });

  it("times review from the request to the first review, and ignores the author's own", () => {
    const spans = spansOf(
      "review",
      [
        pr({
          createdAt: "2026-10-05T09:00:00Z",
          timelineItems: [requested("2026-10-05T09:00:00Z")],
          reviews: [review("2026-10-05T12:00:00Z", "COMMENTED", "octocat"), review("2026-10-06T09:00:00Z")],
        }),
      ],
      NOW,
    );
    expect(spans[0].endedAt).toBe("2026-10-06T09:00:00Z");
    expect(spans[0].days).toBeCloseTo(1, 5);
  });

  it("counts an open pull request whose reviewer has not answered as waiting", () => {
    const spans = spansOf(
      "review",
      [pr({ createdAt: "2026-10-05T09:00:00Z", timelineItems: [requested("2026-10-07T12:00:00Z")] })],
      NOW,
    );
    expect(spans[0].endedAt).toBeNull();
    expect(spans[0].days).toBeCloseTo(1, 5);
  });

  it("times the merge decision from the approval", () => {
    const spans = spansOf(
      "decision",
      [
        pr({
          state: "MERGED",
          mergedAt: "2026-10-06T15:00:00Z",
          reviews: [review("2026-10-06T09:00:00Z", "APPROVED")],
        }),
      ],
      NOW,
    );
    expect(spans[0].days).toBeCloseTo(0.25, 5);
  });

  it("leaves out a merged pull request that was never approved", () => {
    expect(spansOf("decision", [pr({ state: "MERGED", mergedAt: "2026-10-06T15:00:00Z" })], NOW)).toEqual([]);
  });

  it("skips the weekend, so Friday to Monday is one day", () => {
    const spans = spansOf(
      "review",
      [
        pr({
          createdAt: "2026-10-02T09:00:00Z",
          timelineItems: [requested("2026-10-02T09:00:00Z")],
          reviews: [review("2026-10-05T09:00:00Z")],
        }),
      ],
      NOW,
    );
    expect(spans[0].days).toBeCloseTo(1, 5);
  });
});

describe("percentilesOf", () => {
  it("reads the three marks off a long tail", () => {
    const values = [0.1, 0.1, 0.2, 0.2, 0.3, 0.4, 1.2, 2.5, 4, 9];
    expect(percentilesOf(values)).toEqual({ median: 0.4, p75: 2.5, p90: 9 });
  });

  it("is zero for nothing", () => {
    expect(percentilesOf([])).toEqual({ median: 0, p75: 0, p90: 0 });
  });
});

describe("countIntoBands", () => {
  it("counts each value into exactly one band", () => {
    const values = [0.1, 0.25, 0.9, 1.5, 2.5, 4, 9];
    const counted = countIntoBands(SPREAD_BANDS, values);
    expect(counted.map((band) => band.count)).toEqual([2, 1, 1, 1, 1, 1]);
    expect(counted.reduce((total, band) => total + band.count, 0)).toBe(values.length);
  });

  it("marks the queue bands that are late", () => {
    expect(countIntoBands(QUEUE_BANDS, [0.5, 2, 5, 20]).map((band) => [band.count, band.late])).toEqual([
      [1, false],
      [1, false],
      [1, true],
      [1, true],
    ]);
  });
});

describe("stageSummaries and stageDetail", () => {
  const buckets = [
    { start: Date.parse("2026-09-28T00:00:00Z"), end: Date.parse("2026-10-05T00:00:00Z"), label: "Sep 28" },
    { start: Date.parse("2026-10-05T00:00:00Z"), end: NOW, label: "Oct 5" },
  ];
  const prs = [
    pr({
      id: "a",
      number: 1,
      createdAt: "2026-10-05T09:00:00Z",
      timelineItems: [requested("2026-10-05T09:00:00Z")],
      reviews: [review("2026-10-05T15:00:00Z")],
    }),
    pr({
      id: "b",
      number: 2,
      createdAt: "2026-09-29T09:00:00Z",
      timelineItems: [requested("2026-09-29T09:00:00Z")],
      reviews: [review("2026-10-01T09:00:00Z")],
    }),
    // Still waiting, so it counts in the queue rather than in the percentiles.
    pr({ id: "c", number: 3, createdAt: "2026-10-05T09:00:00Z", timelineItems: [requested("2026-10-05T09:00:00Z")] }),
  ];

  it("counts what left the stage in the period, and what is still in it", () => {
    const review = stageSummaries(input(prs), buckets, NOW).find((stage) => stage.key === "review")!;
    expect(review.left).toBe(2);
    expect(review.waiting).toBe(1);
    // Nearest rank, so with two spans of 0.25d and 2d the median is the slower.
    expect(review.median).toBeCloseTo(2, 5);
    expect(review.p90).toBeCloseTo(2, 5);
  });

  it("gives each bucket the median of what left in it", () => {
    const review = stageSummaries(input(prs), buckets, NOW).find((stage) => stage.key === "review")!;
    expect(review.weekly.map((value) => Number(value.toFixed(2)))).toEqual([2, 0.25]);
  });

  it("bands the finished and waiting spans, and sorts the queue longest first", () => {
    const detail = stageDetail("review", input(prs), buckets, NOW);
    expect(detail.spread.map((band) => band.count)).toEqual([1, 0, 1, 0, 0, 0]);
    expect(detail.queue.find((band) => band.label === "3–7d")?.count).toBe(1);
    expect(detail.waitingNow.map((span) => span.number)).toEqual([3]);
    expect(detail.series.map((bucket) => bucket.count)).toEqual([1, 1]);
  });
});
