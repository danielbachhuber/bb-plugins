import { describe, expect, it } from "vitest";

import {
  bucketIndex,
  bucketsFor,
  bucketUnitFor,
  DEFAULT_SELECTION,
  PRESETS,
  rangeOf,
  selectionWords,
  unitOfBuckets,
} from "./period";

// vitest.config.ts pins TZ to UTC, so local-time day and week starts are predictable.
const WED_OCT_7 = Date.parse("2026-10-07T15:00:00Z");
const iso = (at: number) => new Date(at).toISOString();
/** A year back, which is drawn by month. */
const YEAR = { from: Date.parse("2025-11-14T00:00:00Z"), to: WED_OCT_7 };

describe("rangeOf", () => {
  it("measures two weeks as fourteen whole days ending now", () => {
    const range = rangeOf({ kind: "preset", id: "2w" }, WED_OCT_7);
    expect(iso(range.from)).toBe("2026-09-24T00:00:00.000Z");
    expect(range.to).toBe(WED_OCT_7);
    expect(bucketsFor(range)).toHaveLength(14);
  });

  it("measures six weeks from the Monday five weeks back", () => {
    const range = rangeOf({ kind: "preset", id: "6w" }, WED_OCT_7);
    expect(iso(range.from)).toBe("2026-08-31T00:00:00.000Z");
    expect(bucketsFor(range)).toHaveLength(6);
  });

  it("measures three months as thirteen weeks", () => {
    expect(bucketsFor(rangeOf({ kind: "preset", id: "3m" }, WED_OCT_7))).toHaveLength(13);
  });

  it("passes a custom range through as it was picked", () => {
    expect(rangeOf({ kind: "custom", from: 1000, to: 2000 }, WED_OCT_7)).toEqual({ from: 1000, to: 2000 });
  });

  it("offers the shortest preset first and starts on six weeks", () => {
    expect(PRESETS[0].id).toBe("2w");
    expect(DEFAULT_SELECTION).toEqual({ kind: "preset", id: "6w" });
  });
});

describe("bucketUnitFor", () => {
  const span = (days: number) => ({ from: WED_OCT_7 - days * 86_400_000, to: WED_OCT_7 });

  it("counts a month or less by day", () => {
    expect(bucketUnitFor(span(1))).toBe("day");
    expect(bucketUnitFor(span(31))).toBe("day");
  });

  it("counts up to half a year by week", () => {
    expect(bucketUnitFor(span(32))).toBe("week");
    expect(bucketUnitFor(span(183))).toBe("week");
  });

  it("counts anything longer by month", () => {
    expect(bucketUnitFor(span(184))).toBe("month");
    expect(bucketUnitFor(span(365))).toBe("month");
  });
});

describe("bucketsFor", () => {
  it("ends the last bucket where the range does", () => {
    const buckets = bucketsFor(rangeOf({ kind: "preset", id: "6w" }, WED_OCT_7));
    expect(buckets.at(-1)?.end).toBe(WED_OCT_7);
    expect(buckets[0].end).toBe(buckets[1].start);
  });

  it("starts a week bucket on the Monday on or before the range", () => {
    const buckets = bucketsFor({ from: Date.parse("2026-09-24T00:00:00Z"), to: WED_OCT_7 }, "week");
    expect(iso(buckets[0].start)).toBe("2026-09-21T00:00:00.000Z");
  });

  it("splits a year into calendar months", () => {
    const buckets = bucketsFor(YEAR);
    expect(buckets).toHaveLength(12);
    expect(iso(buckets[0].start).slice(0, 7)).toBe("2025-11");
    expect(iso(buckets.at(-1)!.start).slice(0, 7)).toBe("2026-10");
  });

  it("splits half a year into weeks, which is still a readable number of points", () => {
    const buckets = bucketsFor({ from: Date.parse("2026-05-14T00:00:00Z"), to: WED_OCT_7 });
    expect(unitOfBuckets(buckets)).toBe("week");
    expect(buckets.length).toBeGreaterThan(20);
  });

  it("labels days and weeks by their date and months by name", () => {
    expect(bucketsFor(rangeOf({ kind: "preset", id: "2w" }, WED_OCT_7)).at(-1)?.label).toBe("Oct 7");
    expect(bucketsFor(rangeOf({ kind: "preset", id: "6w" }, WED_OCT_7))[5].label).toBe("Oct 5");
    expect(bucketsFor(YEAR).at(-1)?.label).toBe("Oct");
  });

  it("draws one bucket for a range shorter than the unit", () => {
    expect(bucketsFor({ from: WED_OCT_7 - 3_600_000, to: WED_OCT_7 })).toHaveLength(1);
  });
});

describe("unitOfBuckets", () => {
  it("reads back what the buckets are counting", () => {
    expect(unitOfBuckets(bucketsFor(rangeOf({ kind: "preset", id: "2w" }, WED_OCT_7)))).toBe("day");
    expect(unitOfBuckets(bucketsFor(rangeOf({ kind: "preset", id: "6w" }, WED_OCT_7)))).toBe("week");
    expect(unitOfBuckets(bucketsFor(YEAR))).toBe("month");
  });

  it("says days when there are no buckets at all", () => {
    expect(unitOfBuckets([])).toBe("day");
  });
});

describe("selectionWords", () => {
  it("names a preset in words and a custom range by its dates", () => {
    expect(selectionWords({ kind: "preset", id: "6w" })).toBe("six weeks");
    expect(
      selectionWords({
        kind: "custom",
        from: Date.parse("2026-09-19T00:00:00Z"),
        to: Date.parse("2026-10-10T00:00:00Z"),
      }),
    ).toBe("Sep 19 to Oct 9");
  });
});

describe("bucketIndex", () => {
  const buckets = bucketsFor(rangeOf({ kind: "preset", id: "6w" }, WED_OCT_7));

  it("finds the bucket a time falls in", () => {
    expect(bucketIndex(buckets, Date.parse("2026-08-31T00:00:00Z"))).toBe(0);
    expect(bucketIndex(buckets, Date.parse("2026-10-06T09:00:00Z"))).toBe(5);
  });

  it("returns -1 outside the range", () => {
    expect(bucketIndex(buckets, Date.parse("2026-08-30T23:59:59Z"))).toBe(-1);
    expect(bucketIndex(buckets, WED_OCT_7 + 1)).toBe(-1);
  });
});
