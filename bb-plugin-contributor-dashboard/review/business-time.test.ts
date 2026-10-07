import { describe, expect, it } from "vitest";

import { businessDaysBetween } from "./business-time";

const at = (iso: string) => Date.parse(iso);

describe("businessDaysBetween", () => {
  it("counts whole days within a working week", () => {
    // Monday 09:00 to Wednesday 09:00.
    expect(businessDaysBetween(at("2026-09-07T09:00:00Z"), at("2026-09-09T09:00:00Z"))).toBeCloseTo(2, 5);
  });

  it("counts part of a day as a fraction", () => {
    expect(businessDaysBetween(at("2026-09-07T09:00:00Z"), at("2026-09-07T15:00:00Z"))).toBeCloseTo(0.25, 5);
  });

  it("skips the weekend", () => {
    // Friday 12:00 to Monday 12:00 is one business day, not three.
    expect(businessDaysBetween(at("2026-09-11T12:00:00Z"), at("2026-09-14T12:00:00Z"))).toBeCloseTo(1, 5);
  });

  it("counts nothing for a span inside one weekend", () => {
    expect(businessDaysBetween(at("2026-09-12T01:00:00Z"), at("2026-09-13T23:00:00Z"))).toBeCloseTo(0, 5);
  });

  it("counts a span that starts on a weekend from Monday", () => {
    // Saturday 12:00 to Monday 18:00: only the 18 hours of Monday count.
    expect(businessDaysBetween(at("2026-09-12T12:00:00Z"), at("2026-09-14T18:00:00Z"))).toBeCloseTo(0.75, 5);
  });

  it("counts whole weeks as five days each", () => {
    expect(businessDaysBetween(at("2026-09-07T09:00:00Z"), at("2026-09-21T09:00:00Z"))).toBeCloseTo(10, 5);
  });

  it("is zero when the end is not after the start", () => {
    expect(businessDaysBetween(at("2026-09-09T09:00:00Z"), at("2026-09-09T09:00:00Z"))).toBe(0);
    expect(businessDaysBetween(at("2026-09-09T09:00:00Z"), at("2026-09-08T09:00:00Z"))).toBe(0);
  });
});
