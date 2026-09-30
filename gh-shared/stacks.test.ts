import { describe, expect, it, vi } from "vitest";
import { fetchStacks, parseStacks, stackPositions, stacksQuery, type StackNode } from "./stacks.js";

const node = (number: number, baseRefName: string, headRefName: string, isCrossRepository = false): StackNode => ({
  number,
  baseRefName,
  headRefName,
  isCrossRepository,
});

describe("stackPositions", () => {
  it("numbers a line of four from the bottom, each on the one below", () => {
    const positions = stackPositions(
      [node(615, "gadget-result", "gadget"), node(610, "main", "widget-table"), node(613, "gadget-merge", "gadget-result"), node(612, "widget-table", "gadget-merge")],
      "main",
    );
    expect(Object.fromEntries(positions)).toEqual({
      610: { index: 1, size: 4, on: null },
      612: { index: 2, size: 4, on: 610 },
      613: { index: 3, size: 4, on: 612 },
      615: { index: 4, size: 4, on: 613 },
    });
  });

  it("puts two pull requests on one base at the same index, and counts the whole tree", () => {
    const positions = stackPositions([node(620, "main", "modes"), node(621, "modes", "keys"), node(622, "modes", "demos")], "main");
    expect(positions.get(621)).toEqual({ index: 2, size: 3, on: 620 });
    expect(positions.get(622)).toEqual({ index: 2, size: 3, on: 620 });
  });

  it("leaves out a pull request alone, even on a branch with no open pull request", () => {
    const positions = stackPositions([node(1, "main", "a"), node(2, "merged-branch", "b")], "main");
    expect(positions.size).toBe(0);
  });

  it("starts a stack whose bottom sits on a branch with no open pull request", () => {
    const positions = stackPositions([node(2, "merged-branch", "b"), node(3, "b", "c")], "main");
    expect(positions.get(2)).toEqual({ index: 1, size: 2, on: null });
    expect(positions.get(3)).toEqual({ index: 2, size: 2, on: 2 });
  });

  it("never takes a fork's branch as a base, even when its name matches", () => {
    const positions = stackPositions([node(1, "main", "feature", true), node(2, "feature", "more")], "main");
    expect(positions.size).toBe(0);
  });

  it("never takes a pull request from the default branch as a base", () => {
    const positions = stackPositions([node(1, "release", "main"), node(2, "main", "b")], "main");
    expect(positions.size).toBe(0);
  });
});

describe("parseStacks", () => {
  it("keys positions by repo#number across aliased repositories", () => {
    const raw = JSON.stringify({
      data: {
        r0: {
          nameWithOwner: "acme/widgets",
          defaultBranchRef: { name: "main" },
          pullRequests: { nodes: [node(1, "main", "a"), node(2, "a", "b")] },
        },
        r1: { nameWithOwner: "acme/gadgets", defaultBranchRef: { name: "main" }, pullRequests: { nodes: [node(5, "main", "x")] } },
      },
    });
    expect(Object.fromEntries(parseStacks(raw))).toEqual({
      "acme/widgets#1": { index: 1, size: 2, on: null },
      "acme/widgets#2": { index: 2, size: 2, on: 1 },
    });
  });

  it("skips a repository GitHub returned as null", () => {
    expect(parseStacks(JSON.stringify({ data: { r0: null } })).size).toBe(0);
  });
});

describe("fetchStacks", () => {
  it("asks once for every valid repository, each as a variable", async () => {
    const run = vi.fn(async (_args: string[]) => JSON.stringify({ data: {} }));
    await fetchStacks({ run } as never, ["acme/widgets", "not a slug", "acme/gadgets"]);
    expect(run).toHaveBeenCalledTimes(1);
    const args = run.mock.calls[0]![0];
    expect(args).toContain(`query=${stacksQuery(2)}`);
    expect(args).toEqual(expect.arrayContaining(["o0=acme", "n0=widgets", "o1=acme", "n1=gadgets"]));
  });

  it("makes no call without a repository", async () => {
    const run = vi.fn();
    expect((await fetchStacks({ run } as never, [])).size).toBe(0);
    expect(run).not.toHaveBeenCalled();
  });
});
