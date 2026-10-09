import { describe, expect, it } from "vitest";
import { fetchThreadCounts, parseThreadCounts, threadKey } from "./threads.js";
import type { GhRunner } from "@danielb/gh-shared/gh";

const response = (nodes: unknown[]) => JSON.stringify({ data: { viewer: { login: "octocat" }, nodes } });

/** A thread whose last comment is by `login`. */
const lastBy = (login: string) => ({ comments: { nodes: [{ author: { login } }] } });

const node = (
  number: number,
  threads: Array<{ isResolved: boolean; isOutdated?: boolean; comments?: unknown }>,
  repo = "acme/widgets",
) => ({
  number,
  repository: { nameWithOwner: repo },
  reviewThreads: { nodes: threads },
});

describe("parseThreadCounts", () => {
  it("counts only the unresolved threads", () => {
    const counts = parseThreadCounts(
      response([
        node(42, [
          { isResolved: false },
          { isResolved: true },
          { isResolved: false, isOutdated: true },
        ]),
      ]),
    );
    expect(counts.get(threadKey("acme/widgets", 42))).toEqual({ unresolved: 2, outdated: 1, replied: 0, unansweredBy: [], inlineComments: 0 });
  });

  it("counts the unresolved threads you answered last as replied", () => {
    const counts = parseThreadCounts(
      response([
        node(42, [
          { isResolved: false, ...lastBy("octocat") },
          { isResolved: false, ...lastBy("hubot") },
          { isResolved: false, ...lastBy("hubber") },
          { isResolved: false, ...lastBy("hubber") },
          { isResolved: true, ...lastBy("octocat") },
        ]),
      ]),
    );
    // Whoever spoke last on an unanswered thread is waiting on you, most threads first.
    expect(counts.get(threadKey("acme/widgets", 42))).toEqual({
      unresolved: 4,
      outdated: 0,
      replied: 1,
      unansweredBy: ["hubber", "hubot"],
      inlineComments: 0,
    });
  });

  it("reports zero for a pull request with no threads, not absence", () => {
    // The difference matters: absence means the query did not cover it, zero
    // means it genuinely has none.
    const counts = parseThreadCounts(response([node(42, [])]));
    expect(counts.get(threadKey("acme/widgets", 42))).toEqual({ unresolved: 0, outdated: 0, replied: 0, unansweredBy: [], inlineComments: 0 });
  });

  it("counts every inline comment, resolved threads included", () => {
    const counts = parseThreadCounts(
      response([
        node(42, [
          { isResolved: true, comments: { totalCount: 3, nodes: [{ author: { login: "octocat" } }] } },
          { isResolved: false, comments: { totalCount: 2, nodes: [{ author: { login: "octocat" } }] } },
        ]),
      ]),
    );
    expect(counts.get(threadKey("acme/widgets", 42))!.inlineComments).toBe(5);
  });

  it("keys by repository as well as number", () => {
    const counts = parseThreadCounts(
      response([
        node(42, [{ isResolved: false }]),
        node(42, [{ isResolved: false }, { isResolved: false }], "acme/gadgets"),
      ]),
    );
    expect(counts.get(threadKey("acme/widgets", 42))!.unresolved).toBe(1);
    expect(counts.get(threadKey("acme/gadgets", 42))!.unresolved).toBe(2);
  });

  it("skips a node too incomplete to key", () => {
    const counts = parseThreadCounts(
      response([{ reviewThreads: { nodes: [] } }, { number: 1, repository: {} }]),
    );
    expect(counts.size).toBe(0);
  });

  it("skips a null node, which nodes returns for an id it cannot see", () => {
    expect(parseThreadCounts(response([null, node(7, [])])).size).toBe(1);
  });

  it("tolerates an empty result", () => {
    expect(parseThreadCounts(JSON.stringify({ data: { nodes: [] } })).size).toBe(0);
    expect(parseThreadCounts(JSON.stringify({})).size).toBe(0);
  });
});

describe("fetchThreadCounts", () => {
  it("asks GraphQL, since gh pr list cannot return reviewThreads", async () => {
    const calls: string[][] = [];
    const gh: GhRunner = {
      async run(args) {
        calls.push(args);
        return response([node(42, [{ isResolved: false }])]);
      },
    };
    const counts = await fetchThreadCounts(gh, ["PR_42"]);
    expect(calls[0]!.slice(0, 2)).toEqual(["api", "graphql"]);
    expect(calls[0]).toContain("ids[]=PR_42");
    expect(counts.get(threadKey("acme/widgets", 42))!.unresolved).toBe(1);
  });

  it("makes no call when there are no pull requests", async () => {
    const gh: GhRunner = { async run() { throw new Error("should not be called"); } };
    expect((await fetchThreadCounts(gh, [])).size).toBe(0);
  });

  it("asks for at most a hundred pull requests per call, which nodes caps", async () => {
    const calls: string[][] = [];
    const gh: GhRunner = {
      async run(args) {
        calls.push(args);
        return response([node(calls.length, [{ isResolved: false }])]);
      },
    };
    const ids = Array.from({ length: 150 }, (_, i) => `PR_${i}`);
    const counts = await fetchThreadCounts(gh, ids);
    expect(calls.map((args) => args.filter((arg) => arg.startsWith("ids[]=")).length)).toEqual([100, 50]);
    expect(counts.size).toBe(2);
  });
});
