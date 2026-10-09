import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import {
  ISSUES_QUERY,
  MORE_REVIEWS_QUERY,
  PULL_REQUESTS_QUERY,
  type IssueNode,
  type PullRequestNode,
} from "./github";
import { BACKFILL_MS } from "../dashboard/period";
import { createStore, MIGRATIONS } from "./store";
import { runSync, type GraphqlQuery } from "./sync";

const NOW = Date.parse("2026-10-07T12:00:00Z");

function openStore() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db);
}

function pr(number: number, updatedAt: string, extra: Partial<PullRequestNode> = {}): PullRequestNode {
  return {
    id: `PR_${number}`,
    number,
    title: `Change ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    state: "OPEN",
    isDraft: false,
    createdAt: updatedAt,
    updatedAt,
    closedAt: null,
    mergedAt: null,
    assignees: { nodes: [] },
    author: { __typename: "User", login: "octocat" },
    reviews: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    timelineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    ...extra,
  };
}

function issue(number: number, updatedAt: string, extra: Partial<IssueNode> = {}): IssueNode {
  return {
    id: `I_${number}`,
    number,
    title: `Problem ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    state: "OPEN",
    createdAt: updatedAt,
    updatedAt,
    closedAt: null,
    assignees: { nodes: [] },
    author: { __typename: "User", login: "mona" },
    timelineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
    ...extra,
  };
}

/**
 * A fake GitHub: serves `prs` and `issues` (newest first) in pages of
 * `pageSize`, counting calls. `prCalls` leaves out the issues pass, which
 * makes one call of its own even when there are no issues.
 */
function fakeGithub(prs: PullRequestNode[], pageSize: number, issues: IssueNode[] = []) {
  const calls: Array<{ query: string; after: unknown }> = [];
  const query: GraphqlQuery = async (text, variables) => {
    calls.push({ query: text, after: variables.after });
    if (text === PULL_REQUESTS_QUERY) {
      const start = variables.after === null ? 0 : Number(variables.after);
      const nodes = prs.slice(start, start + pageSize);
      const next = start + pageSize;
      return {
        repository: {
          pullRequests: {
            pageInfo: { hasNextPage: next < prs.length, endCursor: String(next) },
            nodes,
          },
        },
      };
    }
    if (text === ISSUES_QUERY) {
      const start = variables.after === null ? 0 : Number(variables.after);
      const nodes = issues.slice(start, start + pageSize);
      const next = start + pageSize;
      return {
        repository: {
          issues: {
            pageInfo: { hasNextPage: next < issues.length, endCursor: String(next) },
            nodes,
          },
        },
      };
    }
    if (text === MORE_REVIEWS_QUERY) {
      return {
        node: {
          reviews: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "PRR_extra",
                state: "APPROVED",
                submittedAt: "2026-10-01T00:00:00Z",
                createdAt: "2026-10-01T00:00:00Z",
                author: { __typename: "User", login: "hubber" },
              },
            ],
          },
        },
      };
    }
    throw new Error(`unexpected query`);
  };
  return { query, calls, prCalls: () => calls.filter((call) => call.query === PULL_REQUESTS_QUERY) };
}

const recent = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

describe("runSync", () => {
  it("backfills until pull requests are older than the backfill horizon", async () => {
    const store = openStore();
    const prs = [pr(5, recent(1)), pr(4, recent(2)), pr(3, recent(3)), pr(2, new Date(NOW - BACKFILL_MS - 1).toISOString()), pr(1, recent(900))];
    const github = fakeGithub(prs, 2);
    const result = await runSync({ store, query: github.query, repository: "acme/widgets", now: () => NOW, pageSize: 2 });
    expect(store.readActivity("acme/widgets", 0).map((p) => p.number)).toEqual([3, 4, 5]);
    expect(github.prCalls()).toHaveLength(2);
    expect(result.pullRequests).toBe(3);
    const state = store.syncState("acme/widgets");
    expect(state.backfillDone).toBe(true);
    expect(state.highWater).toBe(recent(1));
    expect(state.syncedAt).toBe(NOW);
  });

  it("on a later sync, stops at the pull requests it already has", async () => {
    const store = openStore();
    await runSync({ store, query: fakeGithub([pr(2, recent(5)), pr(1, recent(6))], 50).query, repository: "acme/widgets", now: () => NOW });
    const github = fakeGithub([pr(3, recent(0.5)), pr(1, recent(1)), pr(2, recent(5)), pr(9, recent(7))], 2);
    await runSync({ store, query: github.query, repository: "acme/widgets", now: () => NOW, pageSize: 2 });
    expect(github.prCalls()).toHaveLength(2);
    expect(store.syncState("acme/widgets").highWater).toBe(recent(0.5));
    expect(store.readActivity("acme/widgets", 0).map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("resumes an interrupted backfill from its saved cursor", async () => {
    const store = openStore();
    const prs = [pr(4, recent(1)), pr(3, recent(2)), pr(2, recent(3)), pr(1, recent(4))];
    const failing = fakeGithub(prs, 1);
    let calls = 0;
    const flaky: GraphqlQuery = async (text, variables) => {
      calls += 1;
      if (calls === 3) throw new Error("network");
      return failing.query(text, variables);
    };
    await expect(runSync({ store, query: flaky, repository: "acme/widgets", now: () => NOW, pageSize: 1 })).rejects.toThrow("network");
    expect(store.syncState("acme/widgets").backfillCursor).toBe("2");

    const github = fakeGithub(prs, 1);
    await runSync({ store, query: github.query, repository: "acme/widgets", now: () => NOW, pageSize: 1 });
    // One catch-up page that meets the high-water mark, then the backfill from cursor 2.
    expect(github.prCalls().map((c) => c.after)).toEqual([null, "2", "3"]);
    expect(store.readActivity("acme/widgets", 0)).toHaveLength(4);
  });

  it("fetches the rest of a pull request's reviews past the first hundred", async () => {
    const store = openStore();
    const big = pr(1, recent(1), {
      reviews: { pageInfo: { hasNextPage: true, endCursor: "r100" }, nodes: [] },
    });
    const github = fakeGithub([big], 50);
    await runSync({ store, query: github.query, repository: "acme/widgets", now: () => NOW });
    expect(github.calls.filter((c) => c.query === MORE_REVIEWS_QUERY).map((c) => c.after)).toEqual(["r100"]);
    expect(store.readActivity("acme/widgets", 0)[0].reviews.map((r) => r.id)).toEqual(["PRR_extra"]);
  });

  it("still picks up new pull requests after backfilling an empty repository", async () => {
    const store = openStore();
    await runSync({ store, query: fakeGithub([], 50).query, repository: "acme/widgets", now: () => NOW });
    await runSync({ store, query: fakeGithub([pr(1, recent(0.1))], 50).query, repository: "acme/widgets", now: () => NOW });
    expect(store.readActivity("acme/widgets", 0)).toHaveLength(1);
  });
});

describe("runSync, issues", () => {
  it("backfills issues alongside pull requests, and keeps their marks apart", async () => {
    const store = openStore();
    const github = fakeGithub([pr(1, recent(1))], 50, [issue(10, recent(2)), issue(11, recent(400))]);
    const result = await runSync({ store, query: github.query, repository: "acme/widgets", now: () => NOW });

    expect(result.pullRequests).toBe(1);
    expect(result.issues).toBe(2);
    expect(store.readIssues("acme/widgets", 0).map((row) => row.number)).toEqual([10, 11]);
    const state = store.syncState("acme/widgets");
    expect(state.backfillDone).toBe(true);
    expect(state.issues.backfillDone).toBe(true);
    expect(state.issues.highWater).toBe(recent(2));
  });

  it("on a later sync, stops at the issues it already has", async () => {
    const store = openStore();
    await runSync({
      store,
      query: fakeGithub([pr(1, recent(3))], 50, [issue(10, recent(3))]).query,
      repository: "acme/widgets",
      now: () => NOW,
    });
    const github = fakeGithub([pr(1, recent(3))], 50, [issue(12, recent(0.5)), issue(10, recent(3))]);
    const result = await runSync({ store, query: github.query, repository: "acme/widgets", now: () => NOW });

    expect(result.issues).toBe(1);
    expect(store.readIssues("acme/widgets", 0).map((row) => row.number)).toEqual([10, 12]);
  });

  it("stores an issue's events", async () => {
    const store = openStore();
    const milestoned = {
      __typename: "MilestonedEvent" as const,
      id: "MIE_1",
      createdAt: recent(2),
    };
    const github = fakeGithub([], 50, [
      issue(10, recent(1), {
        timelineItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [milestoned] },
      }),
    ]);
    await runSync({ store, query: github.query, repository: "acme/widgets", now: () => NOW });

    expect(store.readIssues("acme/widgets", 0)[0].timelineItems).toEqual([milestoned]);
  });
});
