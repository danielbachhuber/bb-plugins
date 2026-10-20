import { describe, expect, it } from "vitest";

import { limitViews, pacePerHour, samplesFromUsage, viewOf, type LimitSample } from "./limits.js";

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 20, 12, 20);
const SESSION_RESET = NOW + 3.5 * HOUR;

function sample(minutesAgo: number, usedPercent: number, over: Partial<LimitSample> = {}): LimitSample {
  return {
    providerId: "claude-code",
    accountKey: "acct_acme",
    label: "Current session",
    kind: "five-hour",
    model: null,
    sampledAt: NOW - minutesAgo * MIN,
    usedPercent,
    resetsAt: SESSION_RESET,
    ...over,
  };
}

describe("pacePerHour", () => {
  it("reads the last hour of a session", () => {
    // The reading before the hour is its baseline: 10% to 28% in 90 minutes.
    const samples = [sample(90, 10), sample(60, 12), sample(30, 20), sample(0, 28)];
    expect(pacePerHour(samples, NOW, "five-hour")).toBeCloseTo(12);
  });

  it("waits for ten minutes of readings", () => {
    expect(pacePerHour([sample(5, 20), sample(0, 22)], NOW, "five-hour")).toBeNull();
    expect(pacePerHour([sample(0, 22)], NOW, "five-hour")).toBeNull();
  });

  it("counts a new window's whole percent after a reset", () => {
    const before = sample(40, 90, { resetsAt: NOW - 20 * MIN });
    const samples = [before, sample(20, 4), sample(0, 10)];
    // 0 to 10% of the new window in 40 minutes.
    expect(pacePerHour(samples, NOW, "five-hour")).toBeCloseTo(15);
  });

  it("reads a day for a weekly limit", () => {
    const weekly = { label: "Weekly limit", kind: "weekly", resetsAt: NOW + 5 * 24 * HOUR };
    const samples = [sample(24 * 60, 30, weekly), sample(60, 41, weekly), sample(0, 42, weekly)];
    expect(pacePerHour(samples, NOW, "weekly")).toBeCloseTo(0.5);
  });

  it("ignores a baseline from long before the lookback", () => {
    const samples = [sample(300, 0), sample(30, 20), sample(0, 28)];
    expect(pacePerHour(samples, NOW, "five-hour")).toBeCloseTo(16);
  });
});

describe("viewOf", () => {
  it("projects to the reset and stays amber past 80%", () => {
    const view = viewOf([sample(60, 9), sample(0, 28)], NOW);
    expect(view.pacePerHour).toBeCloseTo(19);
    expect(view.projectedPercent).toBeCloseTo(94.5);
    expect(view.runsOutAt).toBeNull();
    expect(view.tone).toBe("warning");
  });

  it("says when a fast session runs out", () => {
    const view = viewOf([sample(60, 22), sample(0, 52)], NOW);
    expect(view.runsOutAt).toBe(NOW + 1.6 * HOUR);
    expect(view.tone).toBe("error");
  });

  it("treats a full window as already out", () => {
    const view = viewOf([sample(0, 100)], NOW);
    expect(view.runsOutAt).toBe(NOW);
    expect(view.tone).toBe("error");
  });

  it("has no projection before there is a pace", () => {
    const view = viewOf([sample(0, 28)], NOW);
    expect(view.pacePerHour).toBeNull();
    expect(view.projectedPercent).toBeNull();
    expect(view.tone).toBe("ok");
  });
});

describe("limitViews", () => {
  const weekly = { label: "Weekly limit", kind: "weekly", resetsAt: NOW + 5 * 24 * HOUR };

  it("lists the session first and skips an unused model window", () => {
    const views = limitViews(
      [
        sample(0, 3, weekly),
        sample(0, 28),
        sample(0, 0, { label: "Fable", kind: "weekly", model: "fable" }),
      ],
      NOW,
      30 * MIN,
    );
    expect(views.map((view) => view.label)).toEqual(["Current session", "Weekly limit"]);
  });

  it("keeps two accounts of one provider apart", () => {
    const views = limitViews([sample(0, 28), sample(0, 70, { accountKey: "acct_gadgets" })], NOW, 30 * MIN);
    expect(views.map((view) => view.usedPercent).sort()).toEqual([28, 70]);
  });

  it("drops a window whose latest reading is stale", () => {
    expect(limitViews([sample(45, 28)], NOW, 30 * MIN)).toEqual([]);
  });
});

describe("samplesFromUsage", () => {
  it("reads each ok provider's windows and skips the rest", () => {
    const samples = samplesFromUsage(
      {
        "claude-code": {
          status: "ok",
          accountKey: "acct_acme",
          windows: [
            { label: "Current session", usedPercent: 46, resetsAt: "2026-10-20T15:50:00.040Z", kind: "five-hour" },
            { label: "Fable", usedPercent: 0, resetsAt: "2026-10-27T11:00:00.000Z", kind: "weekly", model: "fable" },
          ],
        },
        codex: { status: "error", message: "Provider usage could not be loaded." },
      },
      NOW,
    );
    expect(samples).toEqual([
      expect.objectContaining({ providerId: "claude-code", label: "Current session", usedPercent: 46, model: null }),
      expect.objectContaining({ label: "Fable", model: "fable", kind: "weekly" }),
    ]);
    expect(samples[0]!.resetsAt).toBe(Date.parse("2026-10-20T15:50:00.040Z"));
  });
});
