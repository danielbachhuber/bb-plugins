import { describe, expect, it } from "vitest";
import { PR_LIST_FIELDS, REPO_SLUG_PATTERN, discoverRepos, fetchRepoPullRequests, runSweep } from "./gh.js";
import type { GhRunner } from "./gh.js";
import { makePr } from "./fixtures.js";

function fakeGh(responses: Record<string, unknown>): GhRunner & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    async run(args: string[]) {
      calls.push(args);
      const key = args[0] === "search" ? "search" : `${args[0]}:${args[args.indexOf("--repo") + 1]}`;
      if (!(key in responses)) throw new Error(`unexpected gh call: ${args.join(" ")}`);
      const value = responses[key];
      if (value instanceof Error) throw value;
      return JSON.stringify(value);
    },
  };
}

describe("REPO_SLUG_PATTERN", () => {
  it("accepts ordinary slugs", () => {
    expect(REPO_SLUG_PATTERN.test("acme/widgets")).toBe(true);
    expect(REPO_SLUG_PATTERN.test("acme-co/my.repo_v2")).toBe(true);
  });

  it("rejects anything that could smuggle an argument", () => {
    for (const bad of ["--version", "acme/widgets;rm -rf /", "acme widgets", "acme/", "/widgets", "a/b/c"]) {
      expect(REPO_SLUG_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("discoverRepos", () => {
  it("returns distinct repositories from the search result", async () => {
    const gh = fakeGh({
      search: [
        { repository: { nameWithOwner: "acme/widgets" }, number: 1 },
        { repository: { nameWithOwner: "acme/widgets" }, number: 2 },
        { repository: { nameWithOwner: "acme/gadgets" }, number: 3 },
      ],
    });
    const result = await discoverRepos(gh);
    expect(result.repos).toEqual(["acme/gadgets", "acme/widgets"]);
    expect(result.truncated).toBe(false);
  });

  it("reports truncation at the 100-PR ceiling", async () => {
    const gh = fakeGh({
      search: Array.from({ length: 100 }, (_, index) => ({
        repository: { nameWithOwner: "acme/widgets" },
        number: index + 1,
      })),
    });
    expect((await discoverRepos(gh)).truncated).toBe(true);
  });

  it("drops a malformed slug rather than passing it to gh", async () => {
    const gh = fakeGh({
      search: [
        { repository: { nameWithOwner: "acme/widgets" }, number: 1 },
        { repository: { nameWithOwner: "--version" }, number: 2 },
      ],
    });
    expect((await discoverRepos(gh)).repos).toEqual(["acme/widgets"]);
  });
});

describe("fetchRepoPullRequests", () => {
  it("re-queries UNKNOWN mergeability exactly once and merges the answer", async () => {
    const calls: string[][] = [];
    const gh: GhRunner = {
      async run(args) {
        calls.push(args);
        if (args[0] === "pr" && args[1] === "list") {
          return JSON.stringify([makePr({ number: 7, mergeable: "UNKNOWN" })]);
        }
        return JSON.stringify({ number: 7, mergeable: "CLEAN", mergeStateStatus: "CLEAN" });
      },
    };
    const prs = await fetchRepoPullRequests(gh, "acme/widgets");
    expect(prs[0]!.mergeable).toBe("CLEAN");
    expect(calls.filter((call) => call[1] === "view")).toHaveLength(1);
  });

  it("leaves mergeability UNKNOWN when the re-query also says UNKNOWN", async () => {
    const gh: GhRunner = {
      async run(args) {
        if (args[1] === "list") return JSON.stringify([makePr({ number: 7, mergeable: "UNKNOWN" })]);
        return JSON.stringify({ number: 7, mergeable: "UNKNOWN", mergeStateStatus: "UNKNOWN" });
      },
    };
    expect((await fetchRepoPullRequests(gh, "acme/widgets"))[0]!.mergeable).toBe("UNKNOWN");
  });

  it("refuses a slug that fails validation", async () => {
    const gh: GhRunner = { async run() { throw new Error("should not be called"); } };
    await expect(fetchRepoPullRequests(gh, "--version")).rejects.toThrow(/invalid repository/i);
  });
});

describe("runSweep", () => {
  it("keeps going when one repository fails and reports it", async () => {
    const gh: GhRunner = {
      async run(args) {
        if (args[0] === "search") {
          return JSON.stringify([
            { repository: { nameWithOwner: "acme/widgets" }, number: 1 },
            { repository: { nameWithOwner: "acme/gadgets" }, number: 2 },
          ]);
        }
        if (args.includes("acme/gadgets")) throw new Error("boom");
        return JSON.stringify([makePr({ number: 1 })]);
      },
    };
    const result = await runSweep(gh, () => 1_700_000_000_000);
    expect(result.failedRepos).toEqual(["acme/gadgets"]);
    expect(result.rows).toHaveLength(1);
    expect(result.sweptAt).toBe(1_700_000_000_000);
  });
});

describe("runSweep stacks", () => {
  it("puts each row in its stack from one more call, for the swept repositories only", async () => {
    const stackCalls: string[][] = [];
    const gh: GhRunner = {
      async run(args) {
        if (args[0] === "search") return JSON.stringify([{ repository: { nameWithOwner: "acme/widgets" }, number: 2 }]);
        if (args[0] === "pr") return JSON.stringify([makePr({ number: 2 })]);
        if (args.some((arg) => arg.startsWith("o0="))) {
          stackCalls.push(args);
          return JSON.stringify({
            data: {
              r0: {
                nameWithOwner: "acme/widgets",
                defaultBranchRef: { name: "main" },
                pullRequests: {
                  nodes: [
                    { number: 1, baseRefName: "main", headRefName: "a", isCrossRepository: false },
                    { number: 2, baseRefName: "a", headRefName: "b", isCrossRepository: false },
                  ],
                },
              },
            },
          });
        }
        return JSON.stringify({ data: {} });
      },
    };
    const result = await runSweep(gh, () => 1);
    expect(stackCalls).toHaveLength(1);
    expect(stackCalls[0]).toEqual(expect.arrayContaining(["o0=acme", "n0=widgets"]));
    expect(result.rows[0]!.stack).toEqual({ index: 2, size: 2, on: 1 });
  });
});

describe("runSweep repository filter", () => {
  /** Records every repository a detail call was made for. */
  function trackingRunner(fetched: string[]): GhRunner {
    return {
      async run(args) {
        if (args[0] === "search") {
          return JSON.stringify([
            { repository: { nameWithOwner: "acme/widgets" }, number: 1 },
            { repository: { nameWithOwner: "acme/gadgets" }, number: 2 },
          ]);
        }
        // Only the per-repository fan-out; the sweep also makes a GraphQL
        // call for thread counts.
        if (args[0] === "pr" && args[1] === "list") {
          fetched.push(args[args.indexOf("--repo") + 1]!);
          return JSON.stringify([makePr({ number: 1 })]);
        }
        return JSON.stringify({ data: {} });
      },
    };
  }

  it("never fetches a repository the filter excludes", async () => {
    const fetched: string[] = [];
    const result = await runSweep(trackingRunner(fetched), () => 1, {
      allows: (repo) => repo === "acme/widgets",
    });
    // The saving is the point: an excluded repo costs no gh call at all.
    expect(fetched).toEqual(["acme/widgets"]);
    expect(result.repos).toEqual(["acme/widgets"]);
    expect(result.skippedRepos).toEqual(["acme/gadgets"]);
  });

  it("waives the reviewer requirement only where it is asked for", async () => {
    const fetched: string[] = [];
    const result = await runSweep(
      trackingRunner(fetched),
      () => 1,
      undefined,
      (repo) => repo === "acme/widgets",
    );
    const flagsFor = (repo: string) =>
      result.rows.find((row) => row.repo === repo)?.flags ?? [];
    expect(flagsFor("acme/widgets")).not.toContain("no-reviewer");
    expect(flagsFor("acme/gadgets")).toContain("no-reviewer");
  });

  it("asks for review threads on the swept pull requests only", async () => {
    const threadCalls: string[][] = [];
    const gh: GhRunner = {
      async run(args) {
        if (args[0] === "search") {
          return JSON.stringify([
            { repository: { nameWithOwner: "acme/widgets" }, number: 1 },
            { repository: { nameWithOwner: "acme/gadgets" }, number: 2 },
          ]);
        }
        if (args[0] === "pr" && args[1] === "list") {
          const repo = args[args.indexOf("--repo") + 1]!;
          return JSON.stringify([makePr({ number: 1, id: `PR_${repo}` })]);
        }
        if (args.some((arg) => arg.startsWith("ids[]="))) threadCalls.push(args);
        return JSON.stringify({ data: {} });
      },
    };
    await runSweep(gh, () => 1, { allows: (repo) => repo === "acme/widgets" });
    expect(threadCalls).toHaveLength(1);
    expect(threadCalls[0]!.filter((arg) => arg.startsWith("ids[]="))).toEqual(["ids[]=PR_acme/widgets"]);
  });

  it("sweeps everything and skips nothing without a filter", async () => {
    const fetched: string[] = [];
    const result = await runSweep(trackingRunner(fetched), () => 1);
    expect(fetched).toEqual(["acme/gadgets", "acme/widgets"]);
    expect(result.skippedRepos).toEqual([]);
  });
});


describe("PR_LIST_FIELDS", () => {
  it("asks for updatedAt, which the stale rule reads, in the call the sweep already makes", () => {
    expect(PR_LIST_FIELDS.split(",")).toContain("updatedAt");
    expect(PR_LIST_FIELDS.split(",")).toContain("comments");
  });

  it("asks for the size and base branch the row shows, in the same call", () => {
    for (const field of ["additions", "deletions", "baseRefName"]) {
      expect(PR_LIST_FIELDS.split(",")).toContain(field);
    }
  });
});
