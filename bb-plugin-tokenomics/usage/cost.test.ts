import { describe, expect, it } from "vitest";

import { costByTurn, costOf, parseWeights, partsOfRow, weightsFor, type PartRow } from "./cost.js";

const parts = { input: 1_000, cacheWrite: 10_000, cacheRead: 1_000_000, output: 2_000 };

describe("costOf", () => {
  it("weights Claude Code's parts by price, with an hour-long cache's writes at 2", () => {
    expect(costOf(parts, "claude-code")).toBe(1_000 + 12_500 + 100_000 + 10_000);
    expect(costOf(parts, "claude-code", 3_600_000)).toBe(1_000 + 20_000 + 100_000 + 10_000);
  });

  it("counts every token as 1 on a provider with no weights, and says it is unweighted", () => {
    expect(costOf(parts, "codex")).toBe(1_013_000);
    expect(weightsFor("codex").weighted).toBe(false);
    expect(weightsFor("claude-code").weighted).toBe(true);
  });
});

describe("parseWeights", () => {
  it("lays overrides on the defaults, part by part", () => {
    const table = parseWeights('{"claude-code": {"output": 4}, "codex": {"cacheRead": 0.25}}');
    expect(weightsFor("claude-code", table).weights).toMatchObject({ output: 4, cacheRead: 0.1 });
    expect(weightsFor("codex", table)).toEqual({ weights: { input: 1, cacheWrite: 1, cacheWriteLong: 1, cacheRead: 0.25, output: 1 }, weighted: true });
    expect(parseWeights("")).toEqual(parseWeights("{}"));
  });

  it("rejects what it cannot use", () => {
    expect(() => parseWeights("[]")).toThrow(/JSON object/);
    expect(() => parseWeights('{"codex": {"reads": 1}}')).toThrow(/unknown part "reads"/);
    expect(() => parseWeights('{"codex": {"output": -1}}')).toThrow(/from 0/);
  });
});

describe("partsOfRow", () => {
  it("splits stored writes from uncached input, and treats an older row's input as writes only on Claude Code", () => {
    expect(partsOfRow({ input: 1_000, cacheWrite: 900, cacheRead: 5, output: 1 }, "codex")).toEqual({ input: 100, cacheWrite: 900, cacheRead: 5, output: 1 });
    expect(partsOfRow({ input: 1_000, cacheWrite: null, cacheRead: 5, output: 1 }, "claude-code")).toEqual({ input: 0, cacheWrite: 1_000, cacheRead: 5, output: 1 });
    expect(partsOfRow({ input: 1_000, cacheWrite: null, cacheRead: 5, output: 1 }, "codex")).toEqual({ input: 1_000, cacheWrite: 0, cacheRead: 5, output: 1 });
  });
});

describe("costByTurn", () => {
  it("puts each row in the last turn that started before it, with subagents apart", () => {
    const row = (at: number, subagent: boolean): PartRow => ({ at, input: 100, cacheWrite: 100, cacheRead: 1_000, output: 10, ttlMs: null, subagent });
    const [first, second] = costByTurn([1_000, 5_000], [row(500, false), row(2_000, false), row(3_000, true), row(6_000, false)], "claude-code");
    expect(first!.total.cost).toBe(2 * (125 + 100 + 50));
    expect(first!.subagents.cost).toBe(275);
    expect(first!.ownCacheWrite).toBe(100);
    expect(second!.total.tokens).toBe(1_110);
  });
});
