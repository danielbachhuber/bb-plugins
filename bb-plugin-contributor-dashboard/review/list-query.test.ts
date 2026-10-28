import { describe, expect, it } from "vitest";

import { authoredFacets, NOBODY, peopleFacets, queryAuthored, queryWaiting, sortBy } from "./list-query";

const pr = (number: number, fields: Partial<Parameters<typeof queryAuthored>[0][number]> = {}) => ({
  number,
  state: "OPEN" as "OPEN" | "CLOSED" | "MERGED",
  isDraft: false,
  createdAt: `2026-10-${String(number).padStart(2, "0")}T09:00:00Z`,
  mergedAt: null,
  firstReviewDays: null,
  mergeDays: null,
  size: null,
  ...fields,
});

describe("sortBy", () => {
  it("puts rows with no value last whichever way it runs", () => {
    const rows = [{ n: 1, v: null }, { n: 2, v: 5 }, { n: 3, v: 1 }];
    expect(sortBy(rows, (row) => row.v, "asc").map((row) => row.n)).toEqual([3, 2, 1]);
    expect(sortBy(rows, (row) => row.v, "desc").map((row) => row.n)).toEqual([2, 3, 1]);
  });

  it("keeps the incoming order for ties", () => {
    const rows = [{ n: 1, v: 2 }, { n: 2, v: 2 }, { n: 3, v: 1 }];
    expect(sortBy(rows, (row) => row.v, "desc").map((row) => row.n)).toEqual([1, 2, 3]);
  });
});

describe("queryAuthored", () => {
  const rows = [
    pr(9, { size: 40 }),
    pr(8, { isDraft: true, size: 900 }),
    pr(7, { state: "MERGED", mergedAt: "2026-10-20T09:00:00Z", mergeDays: 3, firstReviewDays: 1, size: 300 }),
    pr(6, { state: "MERGED", mergedAt: "2026-10-12T09:00:00Z", mergeDays: 0.5, firstReviewDays: 0.2, size: 10 }),
    pr(5, { state: "CLOSED" }),
  ];

  it("keeps one state, counting a draft apart from open", () => {
    expect(queryAuthored(rows, { sort: "opened", direction: "desc", state: "open" }).map((row) => row.number)).toEqual([9]);
    expect(queryAuthored(rows, { sort: "opened", direction: "desc", state: "draft" }).map((row) => row.number)).toEqual([8]);
    expect(authoredFacets(rows)).toEqual({ open: 1, draft: 1, merged: 2, closed: 1 });
  });

  it("sorts by size, merge date, and the review times, with the unmerged and unreviewed last", () => {
    expect(queryAuthored(rows, { sort: "size", direction: "desc", state: null }).map((row) => row.number)).toEqual([8, 7, 9, 6, 5]);
    expect(queryAuthored(rows, { sort: "merged", direction: "asc", state: null }).map((row) => row.number)).toEqual([6, 7, 9, 8, 5]);
    expect(queryAuthored(rows, { sort: "firstReview", direction: "desc", state: null }).map((row) => row.number)).toEqual([7, 6, 9, 8, 5]);
    expect(queryAuthored(rows, { sort: "opened", direction: "asc", state: "merged" }).map((row) => row.number)).toEqual([6, 7]);
  });
});

describe("queryWaiting", () => {
  const rows = [
    { number: 1, author: "mona", assignees: ["hubber"], days: 4 },
    { number: 2, author: "octocat", assignees: [], days: 9 },
    { number: 3, author: "mona", assignees: [], days: 1 },
  ];

  it("narrows by author and by nobody assigned, longest wait first", () => {
    expect(queryWaiting(rows, { sort: "wait", direction: "desc", author: "mona", assignee: null }).map((row) => row.number)).toEqual([1, 3]);
    expect(queryWaiting(rows, { sort: "wait", direction: "desc", author: null, assignee: NOBODY }).map((row) => row.number)).toEqual([2, 3]);
  });

  it("counts each menu's choices under the other filter only", () => {
    expect(peopleFacets(rows, { author: "mona", assignee: NOBODY })).toEqual({
      authors: [{ login: "mona", count: 1 }, { login: "octocat", count: 1 }],
      assignees: [{ login: "hubber", count: 1 }],
      nobody: 1,
    });
  });
});
