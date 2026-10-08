import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import type { PullRequestNode } from "./github";
import { createStore, MIGRATIONS } from "./store";

function openStore() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db);
}

function node(overrides: Partial<PullRequestNode> = {}): PullRequestNode {
  return {
    id: "PR_1",
    number: 1,
    title: "Add retry to widget sync",
    url: "https://github.com/acme/widgets/pull/1",
    state: "OPEN",
    isDraft: false,
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
    closedAt: null,
    mergedAt: null,
    author: { __typename: "User", login: "octocat" },
    reviews: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          id: "PRR_1",
          state: "APPROVED",
          submittedAt: "2026-09-02T09:00:00Z",
          createdAt: "2026-09-02T09:00:00Z",
          author: { __typename: "User", login: "hubber" },
        },
      ],
    },
    timelineItems: {
      pageInfo: { hasNextPage: false, endCursor: null },
      nodes: [
        {
          __typename: "ReviewRequestedEvent",
          id: "RRE_1",
          createdAt: "2026-09-01T11:00:00Z",
          actor: { login: "octocat" },
          requestedReviewer: { __typename: "User", login: "hubber" },
        },
      ],
    },
    ...overrides,
  };
}

describe("store", () => {
  it("round-trips a pull request with its reviews and timeline, in GitHub's shape", () => {
    const store = openStore();
    store.upsertPullRequests("acme/widgets", [node()]);
    const [pr] = store.readActivity("acme/widgets", Date.parse("2026-09-01T00:00:00Z"));
    expect(pr.number).toBe(1);
    expect(pr.author).toEqual({ __typename: "User", login: "octocat" });
    expect(pr.reviews.map((r) => r.id)).toEqual(["PRR_1"]);
    expect(pr.timelineItems.map((t) => t.id)).toEqual(["RRE_1"]);
    expect("reviews" in JSON.parse(store.rawPullRequest("PR_1") ?? "{}")).toBe(false);
  });

  it("replaces a pull request's fields on a second sync without duplicating children", () => {
    const store = openStore();
    store.upsertPullRequests("acme/widgets", [node()]);
    store.upsertPullRequests("acme/widgets", [node({ state: "MERGED", updatedAt: "2026-09-03T10:00:00Z" })]);
    const prs = store.readActivity("acme/widgets", 0);
    expect(prs).toHaveLength(1);
    expect(prs[0].state).toBe("MERGED");
    expect(prs[0].reviews).toHaveLength(1);
  });

  it("adds reviews fetched separately to the pull request they belong to", () => {
    const store = openStore();
    store.upsertPullRequests("acme/widgets", [node()]);
    store.upsertReviews("PR_1", [
      {
        id: "PRR_2",
        state: "COMMENTED",
        submittedAt: "2026-09-02T12:00:00Z",
        createdAt: "2026-09-02T12:00:00Z",
        author: { __typename: "User", login: "mona" },
      },
    ]);
    expect(store.readActivity("acme/widgets", 0)[0].reviews.map((r) => r.id)).toEqual(["PRR_1", "PRR_2"]);
  });

  it("reads only pull requests updated since the given time, and only for that repository", () => {
    const store = openStore();
    store.upsertPullRequests("acme/widgets", [node()]);
    store.upsertPullRequests("acme/gadgets", [node({ id: "PR_9", number: 9 })]);
    expect(store.readActivity("acme/widgets", Date.parse("2026-09-03T00:00:00Z"))).toHaveLength(0);
    expect(store.readActivity("acme/widgets", 0).map((pr) => pr.number)).toEqual([1]);
  });

  it("keeps sync progress per repository", () => {
    const store = openStore();
    const empty = { highWater: null, backfillCursor: null, backfillDone: false };
    expect(store.syncState("acme/widgets")).toEqual({ ...empty, issues: { ...empty }, syncedAt: null });
    store.saveSyncState("acme/widgets", {
      highWater: "2026-09-02T10:00:00Z",
      backfillCursor: "Y3Vyc29y",
      backfillDone: false,
      issues: { highWater: "2026-09-01T10:00:00Z", backfillCursor: "aXNzdWU", backfillDone: true },
      syncedAt: 123,
    });
    expect(store.syncState("acme/widgets").backfillCursor).toBe("Y3Vyc29y");
    // Issues keep their own marks, so one kind finishing does not move the other.
    expect(store.syncState("acme/widgets").issues).toEqual({
      highWater: "2026-09-01T10:00:00Z",
      backfillCursor: "aXNzdWU",
      backfillDone: true,
    });
    expect(store.syncState("acme/gadgets").highWater).toBeNull();
  });
});
