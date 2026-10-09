import { describe, expect, it } from "vitest";

import { bucketIndex, bucketsFor, bucketUnitOf, DEFAULT_PERIOD, PERIODS } from "./period";

// vitest.config.ts pins TZ to UTC, so local-time week starts are predictable.
const WED_OCT_7 = Date.parse("2026-10-07T15:00:00Z");

describe("bucketsFor", () => {
  it("splits six weeks into six Monday-start weeks ending with the current one", () => {
    const buckets = bucketsFor("6w", WED_OCT_7);
    expect(buckets).toHaveLength(6);
    expect(new Date(buckets[0].start).toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(new Date(buckets[5].start).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(buckets[5].end).toBe(WED_OCT_7);
    expect(buckets[0].end).toBe(buckets[1].start);
  });

  it("splits twelve weeks into twelve weeks", () => {
    expect(bucketsFor("12w", WED_OCT_7)).toHaveLength(12);
  });

  it("splits six months into calendar months ending with the current one", () => {
    const buckets = bucketsFor("6m", WED_OCT_7);
    expect(buckets.map((b) => new Date(b.start).toISOString().slice(0, 7))).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
  });

  it("splits a year into twelve months", () => {
    const buckets = bucketsFor("1y", WED_OCT_7);
    expect(buckets).toHaveLength(12);
    expect(new Date(buckets[0].start).toISOString().slice(0, 7)).toBe("2025-11");
  });

  it("splits a week into seven days ending today", () => {
    const buckets = bucketsFor("1w", WED_OCT_7);
    expect(buckets).toHaveLength(7);
    expect(new Date(buckets[0].start).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(new Date(buckets[6].start).toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(buckets[6].end).toBe(WED_OCT_7);
  });

  it("splits three weeks into twenty-one days", () => {
    const buckets = bucketsFor("3w", WED_OCT_7);
    expect(buckets).toHaveLength(21);
    expect(new Date(buckets[0].start).toISOString()).toBe("2026-09-17T00:00:00.000Z");
  });

  it("labels days and weeks by their date and months by name", () => {
    expect(bucketsFor("1w", WED_OCT_7)[6].label).toBe("Oct 7");
    expect(bucketsFor("6w", WED_OCT_7)[5].label).toBe("Oct 5");
    expect(bucketsFor("6m", WED_OCT_7)[5].label).toBe("Oct");
  });

  it("offers the shortest period first and starts on six weeks", () => {
    expect(PERIODS[0].id).toBe("1w");
    expect(DEFAULT_PERIOD).toBe("6w");
  });
});

describe("bucketUnitOf", () => {
  it("counts the short periods by day and the long ones by week or month", () => {
    expect(PERIODS.map((period) => bucketUnitOf(period.id))).toEqual([
      "day",
      "day",
      "week",
      "week",
      "month",
      "month",
    ]);
  });
});

describe("bucketIndex", () => {
  const buckets = bucketsFor("6w", WED_OCT_7);

  it("finds the bucket a time falls in", () => {
    expect(bucketIndex(buckets, Date.parse("2026-08-31T00:00:00Z"))).toBe(0);
    expect(bucketIndex(buckets, Date.parse("2026-10-06T09:00:00Z"))).toBe(5);
  });

  it("returns -1 outside the period", () => {
    expect(bucketIndex(buckets, Date.parse("2026-08-30T23:59:59Z"))).toBe(-1);
    expect(bucketIndex(buckets, WED_OCT_7 + 1)).toBe(-1);
  });
});
