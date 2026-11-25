import { describe, expect, it } from "vitest";

import type { StoredIssue, StoredMilestone } from "./github.js";
import { byDue, detail, periodWords, summarize, weekBuckets } from "./summary.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-25T12:00:00Z");

function issue(overrides: Partial<StoredIssue> = {}): StoredIssue {
  return {
    number: 1,
    title: "Fix the widget",
    url: "https://github.com/acme/widgets/issues/1",
    open: true,
    notDone: false,
    assignees: [],
    createdAt: NOW - 60 * DAY,
    closedAt: null,
    addedAt: NOW - 60 * DAY,
    standing: "nobody",
    ...overrides,
  };
}

function milestone(issues: StoredIssue[], overrides: Partial<StoredMilestone> = {}): StoredMilestone {
  return {
    repo: "acme/widgets",
    number: 3,
    title: "2.0",
    url: "https://github.com/acme/widgets/milestone/3",
    due: null,
    createdAt: NOW - 90 * DAY,
    open: issues.filter((i) => i.open).length,
    closed: issues.filter((i) => !i.open).length,
    issues,
    ...overrides,
  };
}

describe("weekBuckets", () => {
  it("ends at now, oldest first", () => {
    const buckets = weekBuckets(NOW, 2);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].start).toBe(NOW - 14 * DAY);
    expect(buckets[1].end).toBe(NOW + 1);
  });
});

describe("periodWords", () => {
  it("spells small counts out", () => {
    expect(periodWords(6)).toBe("six weeks");
    expect(periodWords(1)).toBe("one week");
    expect(periodWords(20)).toBe("20 weeks");
  });
});

describe("summarize", () => {
  it("counts what was added and closed in each week, and the open issues nobody holds", () => {
    const summary = summarize(
      milestone([
        issue({ number: 1 }),
        issue({ number: 2, addedAt: NOW - 3 * DAY, assignees: ["octocat"] }),
        issue({ number: 3, addedAt: NOW - 10 * DAY }),
        issue({ number: 4, open: false, closedAt: NOW - 2 * DAY }),
      ]),
      weekBuckets(NOW, 2),
    );
    expect(summary.added).toEqual([1, 1]);
    expect(summary.closedIn).toEqual([0, 1]);
    expect(summary.nobody).toBe(2);
    expect(summary.openAdded).toBe(2);
  });
});

describe("byDue", () => {
  it("puts the soonest due first and no due date last", () => {
    const buckets = weekBuckets(NOW, 1);
    const a = summarize(milestone([], { number: 1, due: NOW + 10 * DAY }), buckets);
    const b = summarize(milestone([], { number: 2, due: null }), buckets);
    const c = summarize(milestone([], { number: 3, due: NOW - DAY }), buckets);
    expect([a, b, c].sort(byDue).map((m) => m.number)).toEqual([3, 1, 2]);
  });
});

describe("detail", () => {
  it("lists the most advanced open issues first and the latest closed first", () => {
    const result = detail(
      milestone([
        issue({ number: 1, standing: "nobody" }),
        issue({ number: 2, standing: "review" }),
        issue({ number: 3, open: false, closedAt: NOW - 5 * DAY }),
        issue({ number: 4, open: false, closedAt: NOW - DAY, notDone: true }),
      ]),
      NOW,
    );
    expect(result.open.map((i) => i.number)).toEqual([2, 1]);
    expect(result.closed.map((i) => [i.number, i.notDone])).toEqual([
      [4, true],
      [3, false],
    ]);
  });

  it("charts the issues in it and closed, ending today", () => {
    const { history } = detail(
      milestone([issue({ addedAt: NOW - 20 * DAY }), issue({ number: 2, open: false, addedAt: NOW - 20 * DAY, closedAt: NOW - DAY })], {
        createdAt: NOW - 21 * DAY,
      }),
      NOW,
    );
    expect(history.at.at(-1)).toBe(NOW);
    expect(history.total.at(-1)).toBe(2);
    expect(history.closed.at(-1)).toBe(1);
    expect(history.total[0]).toBe(0);
  });
});
