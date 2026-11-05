import { describe, expect, it, vi } from "vitest";
import { fetchStacks, parseStacks, stacksQuery } from "./stacks.js";

const entry = (position: number, number: number, state = "OPEN") => ({ position, pullRequest: { number, state } });
const stacked = (number: number, position: number, entries: ReturnType<typeof entry>[]) => ({
  number,
  stackEntry: { position, stack: { size: entries.length, entries: { nodes: entries } } },
});

describe("parseStacks", () => {
  it("reads each pull request's place as GitHub numbers it, merged layers included", () => {
    const stack = [entry(1, 610, "MERGED"), entry(2, 612), entry(3, 615)];
    const raw = JSON.stringify({
      data: {
        r0: {
          nameWithOwner: "acme/widgets",
          pullRequests: { nodes: [stacked(612, 2, stack), stacked(615, 3, stack), { number: 620, stackEntry: null }] },
        },
        r1: { nameWithOwner: "acme/gadgets", pullRequests: { nodes: [{ number: 5, stackEntry: null }] } },
      },
    });
    expect(Object.fromEntries(parseStacks(raw))).toEqual({
      // The layer below merged, so there is nothing to merge first.
      "acme/widgets#612": { index: 2, size: 3, on: null },
      "acme/widgets#615": { index: 3, size: 3, on: 612 },
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
