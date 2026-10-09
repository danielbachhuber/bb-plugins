import { describe, expect, it } from "vitest";

import type { GhRunner } from "./gh.js";
import { createSyncUsage, pointsBetween, readBudget } from "./usage.js";

const RESET = Date.UTC(2026, 9, 9, 18, 19, 5);
const OTHER_RESET = Date.UTC(2026, 9, 9, 18, 16, 5);

function budgetJson(used: number, resetAt: number): string {
  return JSON.stringify({ data: { rateLimit: { used, limit: 5000, resetAt: new Date(resetAt).toISOString() } } });
}

/** Answers budget readings from a queue, and every other call with "[]". */
function fakeGh(readings: string[]): GhRunner & { args: string[][] } {
  const args: string[][] = [];
  return {
    args,
    async run(call) {
      args.push(call);
      if (call[0] === "api" && call[1] === "graphql") {
        const next = readings.shift();
        if (next === undefined) throw new Error("no reading");
        return next;
      }
      return "[]";
    },
  };
}

describe("pointsBetween", () => {
  const before = { used: 2500, limit: 5000, resetAt: RESET };

  it("subtracts two readings from the same window", () => {
    expect(pointsBetween(before, { ...before, used: 2602 }, RESET - 60_000)).toBe(102);
  });

  it("counts the new window when the old one ended during the sync", () => {
    expect(pointsBetween(before, { used: 40, limit: 5000, resetAt: RESET + 3_600_000 }, RESET + 1_000)).toBe(40);
  });

  it("refuses a reading from GitHub's other counter", () => {
    expect(pointsBetween(before, { used: 282, limit: 5000, resetAt: OTHER_RESET }, RESET - 60_000)).toBeNull();
  });
});

describe("readBudget", () => {
  it("reads the rate limit", async () => {
    expect(await readBudget(fakeGh([budgetJson(1345, RESET)]))).toEqual({ used: 1345, limit: 5000, resetAt: RESET });
  });

  it("returns null when gh fails or answers something else", async () => {
    expect(await readBudget(fakeGh([]))).toBeNull();
    expect(await readBudget(fakeGh(['{"data":{}}']))).toBeNull();
  });
});

describe("createSyncUsage", () => {
  it("records a sync's points, calls and time", async () => {
    let clock = RESET - 30 * 60_000;
    const usage = createSyncUsage(() => clock);
    const gh = fakeGh([budgetJson(2500, RESET), budgetJson(2500, RESET), budgetJson(2602, RESET)]);
    const result = await usage.measure(gh, async (runner) => {
      await runner.run(["pr", "list"]);
      await runner.run(["pr", "view"]);
      clock += 6_800;
      return "swept";
    });
    expect(result).toBe("swept");
    expect(usage.snapshot()).toEqual({
      syncs: [{ at: RESET - 30 * 60_000, points: 102, calls: 2, ms: 6_800 }],
      budget: { used: 2602, limit: 5000, resetAt: RESET },
    });
  });

  it("reads again when the reading after comes from the other counter", async () => {
    const usage = createSyncUsage(() => RESET - 10 * 60_000);
    const gh = fakeGh([budgetJson(2500, RESET), budgetJson(2500, RESET), budgetJson(282, OTHER_RESET), budgetJson(2510, RESET)]);
    await usage.measure(gh, async () => undefined);
    expect(usage.snapshot().syncs[0]!.points).toBe(10);
  });

  it("matches a reading before from either counter", async () => {
    const usage = createSyncUsage(() => RESET - 10 * 60_000);
    const gh = fakeGh([budgetJson(280, OTHER_RESET), budgetJson(2500, RESET), budgetJson(2504, RESET)]);
    await usage.measure(gh, async () => undefined);
    expect(usage.snapshot().syncs[0]!.points).toBe(4);
  });

  it("records a sync that throws, and rethrows", async () => {
    const usage = createSyncUsage(() => RESET - 60_000);
    const gh = fakeGh([budgetJson(2500, RESET), budgetJson(2500, RESET), budgetJson(2501, RESET)]);
    await expect(
      usage.measure(gh, async (runner) => {
        await runner.run(["pr", "list"]);
        throw new Error("network");
      }),
    ).rejects.toThrow("network");
    expect(usage.snapshot().syncs).toMatchObject([{ points: 1, calls: 1 }]);
  });

  it("leaves points unknown when the budget cannot be read", async () => {
    const usage = createSyncUsage(() => RESET - 60_000);
    await usage.measure(fakeGh([]), async () => undefined);
    expect(usage.snapshot()).toMatchObject({ syncs: [{ points: null }], budget: null });
  });

  it("keeps only the past hour", async () => {
    let clock = RESET - 2 * 3_600_000;
    const usage = createSyncUsage(() => clock);
    await usage.measure(fakeGh([budgetJson(1, RESET), budgetJson(1, RESET), budgetJson(2, RESET)]), async () => undefined);
    clock = RESET - 30 * 60_000;
    await usage.measure(fakeGh([budgetJson(2, RESET), budgetJson(2, RESET), budgetJson(5, RESET)]), async () => undefined);
    expect(usage.snapshot().syncs.map((sync) => sync.points)).toEqual([3]);
  });
});
