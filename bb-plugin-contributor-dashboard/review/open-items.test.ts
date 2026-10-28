import { describe, expect, it } from "vitest";

import { DEFAULT_QUERY, NOBODY, openFacets, openItems, queryOpen, type OpenQuery } from "./open-items";

function item(number: number, createdAt: string, fields: Record<string, unknown> = {}) {
  return {
    number,
    title: `Widget change ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    createdAt,
    author: { login: "octocat" },
    assignees: [],
    ...fields,
  };
}

describe("openItems", () => {
  it("keeps only what is open, oldest first", () => {
    const rows = openItems([
      item(3, "2026-10-01T09:00:00Z"),
      item(1, "2026-09-01T09:00:00Z"),
      item(2, "2026-09-15T09:00:00Z", { state: "MERGED" }),
      item(4, "2026-09-20T09:00:00Z", { state: "CLOSED" }),
    ]);
    expect(rows.map((row) => row.number)).toEqual([1, 3]);
  });

  it("names the author and assignees, and carries a draft", () => {
    const [row] = openItems([
      item(7, "2026-10-01T09:00:00Z", { author: null, assignees: [{ login: "hubber" }], isDraft: true }),
    ]);
    expect(row).toMatchObject({ author: null, assignees: ["hubber"], isDraft: true });
  });

  it("treats an issue, which has no draft field, as not a draft", () => {
    expect(openItems([item(8, "2026-10-01T09:00:00Z")])[0].isDraft).toBe(false);
  });
});

const NOW = Date.parse("2026-10-28T12:00:00Z");

function rows() {
  return openItems([
    item(1, "2026-01-01T09:00:00Z", { isDraft: true, updatedAt: "2026-02-01T09:00:00Z", additions: 900, deletions: 100 }),
    item(2, "2026-03-01T09:00:00Z", { author: { login: "hubber" }, assignees: [{ login: "mona" }], updatedAt: "2026-10-27T09:00:00Z", additions: 5, deletions: 0 }),
    item(3, "2026-05-01T09:00:00Z", { isDraft: true, updatedAt: "2026-10-26T09:00:00Z", additions: 40, deletions: 2 }),
    item(4, "2026-07-01T09:00:00Z", { author: { login: "hubber" }, updatedAt: "2026-08-01T09:00:00Z", additions: 3000, deletions: 0 }),
  ]);
}

const query = (fields: Partial<OpenQuery>): OpenQuery => ({ ...DEFAULT_QUERY, ...fields });

describe("queryOpen", () => {
  it("keeps oldest first by default", () => {
    expect(queryOpen(rows(), DEFAULT_QUERY, NOW).map((row) => row.number)).toEqual([1, 2, 3, 4]);
  });

  it("sorts by last activity, least recent first, and by size, biggest first", () => {
    expect(queryOpen(rows(), query({ sort: "activity" }), NOW).map((row) => row.number)).toEqual([1, 4, 3, 2]);
    expect(queryOpen(rows(), query({ sort: "size", direction: "desc" }), NOW).map((row) => row.number)).toEqual([4, 1, 3, 2]);
  });

  it("filters by author, nobody assigned, draft, and quiet for 30 days", () => {
    expect(queryOpen(rows(), query({ author: "hubber" }), NOW).map((row) => row.number)).toEqual([2, 4]);
    expect(queryOpen(rows(), query({ assignee: NOBODY }), NOW).map((row) => row.number)).toEqual([1, 3, 4]);
    expect(queryOpen(rows(), query({ assignee: "mona" }), NOW).map((row) => row.number)).toEqual([2]);
    expect(queryOpen(rows(), query({ state: "draft" }), NOW).map((row) => row.number)).toEqual([1, 3]);
    expect(queryOpen(rows(), query({ quiet: true }), NOW).map((row) => row.number)).toEqual([1, 4]);
  });
});

describe("openFacets", () => {
  it("counts each menu's choices under the other filters but not its own", () => {
    const facets = openFacets(rows(), query({ state: "draft", author: "octocat" }), NOW);
    // Authors ignore the author filter: two octocat drafts, no hubber drafts.
    expect(facets.authors).toEqual([{ login: "octocat", count: 2 }]);
    // State ignores the state filter: octocat has two drafts and nothing ready.
    expect([facets.drafts, facets.ready]).toEqual([2, 0]);
    expect(facets.nobody).toBe(2);
    expect(facets.quiet).toBe(1);
  });
});
