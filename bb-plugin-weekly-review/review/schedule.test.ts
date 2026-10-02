import { describe, expect, it } from "vitest";
import { addDays } from "./dates.js";
import type { GatherRow, SourceStatus } from "./db.js";
import { DEFAULT_GATHER_CRON, failingSources, nextRun } from "./freshness.js";
import { plannedGathers } from "./schedule.js";

/** Local time, the way the server reads the schedule. */
const at = (day: string, hour: number, minute = 0) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute);
};

let nextId = 1;
function gather(monday: string, started: Date, sources: SourceStatus[]): GatherRow {
  return {
    id: nextId++,
    monday,
    to: monday,
    trigger: "schedule",
    startedAt: started.toISOString(),
    finishedAt: started.toISOString(),
    sources,
  };
}
const ok = (name: string): SourceStatus => ({ name, ok: true, millis: 1 });
const failed = (name: string, error: string): SourceStatus => ({ name, ok: false, error, millis: 1 });

describe("plannedGathers", () => {
  it("fetches docs on the day's first run and not the second", () => {
    const morning = at("2026-09-09", 7);
    expect(plannedGathers(morning, [])).toEqual([
      { range: { from: "2026-09-07", to: "2026-09-09" }, includeDocs: true },
    ]);

    const recent = [gather("2026-09-07", morning, [ok("Harvest"), ok("Docs")])];
    expect(plannedGathers(at("2026-09-09", 13), recent)).toEqual([
      { range: { from: "2026-09-07", to: "2026-09-09" }, includeDocs: false },
    ]);
  });

  it("gathers the previous week in full on Monday morning, once", () => {
    const friday = gather("2026-08-31", at("2026-09-04", 13), [ok("Harvest")]);
    expect(plannedGathers(at("2026-09-07", 7), [friday])).toEqual([
      { range: { from: "2026-08-31", to: "2026-09-06" }, includeDocs: false },
      { range: { from: "2026-09-07", to: "2026-09-07" }, includeDocs: true },
    ]);

    const closed = gather("2026-08-31", at("2026-09-07", 7), [ok("Harvest")]);
    const opened = gather("2026-09-07", at("2026-09-07", 7), [ok("Harvest"), ok("Docs")]);
    expect(plannedGathers(at("2026-09-07", 13), [opened, closed, friday])).toEqual([
      { range: { from: "2026-09-07", to: "2026-09-07" }, includeDocs: false },
    ]);
  });
});

describe("addDays", () => {
  it("lands on the right day across the night the clocks go forward", () => {
    // US clocks went forward on 2026-03-08; this holds in any time zone.
    expect(addDays("2026-03-09", -7)).toBe("2026-03-02");
    expect(addDays("2026-03-02", 6)).toBe("2026-03-08");
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02");
  });
});

describe("nextRun", () => {
  it("goes from Friday afternoon to Monday morning", () => {
    const next = nextRun(DEFAULT_GATHER_CRON, at("2026-09-11", 13, 5));
    expect(next).toBe(at("2026-09-14", 7).toISOString());
  });

  it("is null for an expression that does not parse", () => {
    expect(nextRun("not a schedule", at("2026-09-11", 13))).toBeNull();
  });
});

describe("failingSources", () => {
  it("names a source whose latest run failed, with when it last worked", () => {
    const first = gather("2026-09-07", at("2026-09-08", 7), [ok("GitHub"), ok("Harvest")]);
    const second = gather("2026-09-07", at("2026-09-08", 13), [
      failed("GitHub", "gh: token expired"),
      ok("Harvest"),
    ]);
    const never = gather("2026-09-07", at("2026-09-08", 13), [failed("Todoist", "td: not logged in")]);

    expect(failingSources([second, never, first])).toEqual([
      { name: "GitHub", error: "gh: token expired", lastOkAt: first.finishedAt },
      { name: "Todoist", error: "td: not logged in", lastOkAt: null },
    ]);
  });

  it("clears once the source succeeds again", () => {
    const failedRun = gather("2026-09-07", at("2026-09-08", 7), [failed("GitHub", "timeout")]);
    const recovered = gather("2026-09-07", at("2026-09-08", 13), [ok("GitHub")]);
    expect(failingSources([recovered, failedRun])).toEqual([]);
  });
});
