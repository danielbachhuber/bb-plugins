import { describe, expect, it } from "vitest";

import {
  callsInTurn,
  forecastInputError,
  parseRange,
  msPerCall,
  timeRange,
  growthPerCall,
  modelName,
  settingsAt,
  settingsLabel,
  trackRecordFor,
  turnRequestOf,
  forecastInTurn,
  toTurnForecast,
  trackRecord,
  verdict,
  type ScoredTurn,
  type StoredForecast,
} from "./forecast.js";

const forecast = (at: number, over: Partial<StoredForecast> = {}): StoredForecast => ({
  at,
  callsLow: 4,
  callsHigh: 8,
  timeLowMs: 60_000,
  timeHighMs: 180_000,
  context: 300_000,
  growth: 0,
  note: null,
  ...over,
});

describe("verdict", () => {
  it("counts both ends of the range as in", () => {
    expect(verdict(4, [4, 8])).toBe("in");
    expect(verdict(8, [4, 8])).toBe("in");
    expect(verdict(9, [4, 8])).toBe("over");
    expect(verdict(3, [4, 8])).toBe("under");
  });
});

describe("toTurnForecast", () => {
  it("prices the call range at the context Claude forecast at", () => {
    expect(toTurnForecast(forecast(0)).tokens).toEqual([1_200_000, 2_400_000]);
  });

  it("adds what each call puts in the context for the next one to read", () => {
    // 4 calls from 300K growing 1K a call: 300K + 301K + 302K + 303K.
    expect(toTurnForecast(forecast(0, { growth: 1_000 })).tokens).toEqual([1_206_000, 2_428_000]);
  });

  it("assumes the usual growth when the thread had too few calls to measure", () => {
    expect(toTurnForecast(forecast(0, { growth: null })).tokens?.[0]).toBe(4 * 300_000 + 1_500 * 6);
  });

  it("leaves tokens out when no context was recorded", () => {
    expect(toTurnForecast(forecast(0, { context: null })).tokens).toBeNull();
  });
});

describe("forecastInTurn", () => {
  it("takes the first forecast inside the turn and ignores later ones", () => {
    // In array order the later forecast comes last, so keeping the last one would pick 500.
    const found = forecastInTurn([forecast(50), forecast(200), forecast(500, { callsHigh: 30 })], 100, 1_000);
    expect(found?.at).toBe(200);
  });

  it("finds a running turn's forecast", () => {
    expect(forecastInTurn([forecast(5_000)], 100, null)?.at).toBe(5_000);
  });

  it("is null when Claude answered without forecasting", () => {
    expect(forecastInTurn([forecast(50), forecast(2_000)], 100, 1_000)).toBeNull();
  });
});

describe("callsInTurn", () => {
  // The five-call turn from a real thread: two responses were recorded twice.
  const samples = [111_938, 112_487, 112_487, 113_640, 113_640, 113_994, 114_720].map((usedTokens, index) => ({
    at: 1_000 + index * 100,
    usedTokens,
  }));

  it("counts each distinct context size once", () => {
    expect(callsInTurn(samples, 1_000, 2_000)).toBe(5);
  });

  it("counts a running turn's calls so far", () => {
    expect(callsInTurn(samples, 1_000, null)).toBe(5);
    expect(callsInTurn(samples.slice(0, 3), 1_000, null)).toBe(2);
  });

  it("leaves out samples from other turns", () => {
    expect(callsInTurn(samples, 1_150, 1_350)).toBe(2);
  });
});

describe("trackRecord", () => {
  const turn = (calls: number, workedMs: number): ScoredTurn => ({
    calls,
    tokens: calls * 300_000,
    workedMs,
    forecast: toTurnForecast(forecast(0)),
  });

  it("says when there is nothing to score yet", () => {
    expect(trackRecord([])).toBe("No scored forecasts yet.");
  });

  it("counts calls in range and says which way the misses lean", () => {
    // Range 4–8 calls (middle 6), 1–3 min (middle 2 min).
    const line = trackRecord([turn(6, 120_000), turn(12, 300_000), turn(18, 360_000), turn(7, 90_000)]);
    expect(line).toBe(
      "Last 4 forecasts: calls in range 2/4 (actual 1.6× over). Aim for 80% in range.",
    );
  });

  it("says about right when the misses cancel out", () => {
    expect(trackRecord([turn(6, 120_000)])).toContain("(actual about right)");
  });

  it("covers only the most recent forecasts", () => {
    const many = Array.from({ length: 30 }, () => turn(6, 120_000));
    expect(trackRecord(many)).toMatch(/^Last 20 forecasts: calls in range 20\/20/);
  });
});

describe("forecastInputError", () => {
  it("accepts a usable range, with or without waits", () => {
    expect(forecastInputError([2, 5], [0, 0])).toBeNull();
    expect(forecastInputError([2, 5], [5, 15])).toBeNull();
  });

  it("rejects a range that runs backwards or starts below one call", () => {
    expect(forecastInputError([2, 1], [0, 0])).toMatch(/--calls must run from low to high/);
    expect(forecastInputError([0, 3], [0, 0])).toMatch(/--calls must start at 1/);
    expect(forecastInputError([2, 5], [15, 5])).toMatch(/--wait-minutes must run from low to high/);
  });
});

describe("msPerCall", () => {
  const turn = (calls: number, seconds: number) => ({ calls, workedMs: seconds * 1_000 });

  it("is the median time per call over the thread's finished turns", () => {
    // 6, 8, and 60 seconds a call: the slow test run doesn't set the pace.
    expect(msPerCall([turn(10, 60), turn(5, 40), turn(2, 120)])).toBe(8_000);
  });

  it("skips turns without calls or times, and is null with fewer than three", () => {
    expect(msPerCall([turn(10, 60), turn(0, 5), { calls: 4, workedMs: null }, turn(5, 40)])).toBeNull();
  });
});

describe("timeRange", () => {
  it("prices the calls at the pace and adds the named waits", () => {
    expect(timeRange([4, 8], 7_000, [0, 0])).toEqual([28_000, 56_000]);
    expect(timeRange([4, 8], 7_000, [300_000, 900_000])).toEqual([328_000, 956_000]);
  });
});

describe("parseRange", () => {
  it("reads a range with a hyphen, an en dash, or two dots", () => {
    expect(parseRange("4-8")).toEqual([4, 8]);
    expect(parseRange("4–8")).toEqual([4, 8]);
    expect(parseRange("0.5..2")).toEqual([0.5, 2]);
  });

  it("reads a single number as a range of one", () => {
    expect(parseRange("5")).toEqual([5, 5]);
  });

  it("rejects anything else", () => {
    expect(parseRange(undefined)).toBeNull();
    expect(parseRange("a few")).toBeNull();
    expect(parseRange("-3")).toBeNull();
  });
});

describe("turn settings", () => {
  const event = (execution: unknown, type = "client/turn/requested") => ({ type, createdAt: 1_000, data: { execution } });
  const opus = { model: "claude-opus-5-5", serviceTier: "default", reasoningLevel: "medium" };
  const fast = { ...opus, serviceTier: "fast" };

  it("reads the settings a turn request carries", () => {
    expect(turnRequestOf(event({ ...opus, permissionMode: "full" }))).toEqual({ at: 1_000, ...opus });
    expect(turnRequestOf(event(opus, "turn/started"))).toBeNull();
    expect(turnRequestOf(event(undefined))).toBeNull();
  });

  it("takes the last request at or before the turn's start", () => {
    const requests = [
      { at: 100, ...opus },
      { at: 500, ...fast },
      { at: 900, ...opus },
    ];
    expect(settingsAt(requests, 600)).toEqual(fast);
    expect(settingsAt(requests, 500)).toEqual(fast);
    expect(settingsAt(requests, 50)).toBeNull();
  });

  it("names the model, fast mode only when on, and the reasoning level", () => {
    expect(settingsLabel(fast)).toBe("Opus 5.5, fast, medium reasoning");
    expect(settingsLabel(opus)).toBe("Opus 5.5, medium reasoning");
    expect(modelName("gpt-5.6-luna")).toBe("gpt-5.6-luna");
  });

  describe("trackRecordFor", () => {
    const scored = (settings: typeof opus) => ({
      calls: 6,
      tokens: 1_800_000,
      workedMs: 120_000,
      forecast: toTurnForecast(forecast(0)),
      settings,
    });

    it("scores only turns with the current settings once there are enough", () => {
      const turns = [scored(opus), scored(opus), scored(opus), scored(fast)];
      expect(trackRecordFor(turns, opus)).toMatch(/^With Opus 5\.5, medium reasoning: Last 3 forecasts/);
    });

    it("falls back to every turn, and says so, when too few match", () => {
      const turns = [scored(opus), scored(opus), scored(fast)];
      expect(trackRecordFor(turns, fast)).toMatch(/^Fewer than 3 with Opus 5\.5, fast, medium reasoning, so across all settings: Last 3/);
    });
  });
});

describe("growthPerCall", () => {
  const samples = (sizes: number[]) => sizes.map((usedTokens, index) => ({ at: index, usedTokens }));

  it("averages how much the context grew from one call to the next", () => {
    expect(growthPerCall(samples([100_000, 101_000, 101_000, 103_000, 106_000]))).toBe(2_000);
  });

  it("leaves out a compaction and a jump over 60K", () => {
    expect(growthPerCall(samples([100_000, 101_000, 40_000, 41_000, 42_000, 142_000, 143_000]))).toBe(1_000);
  });

  it("is null with fewer than three steps", () => {
    expect(growthPerCall(samples([100_000, 101_000, 102_000]))).toBeNull();
  });
});
