import { describe, expect, test } from "vitest";

import { parseDeadline } from "./deadline.js";

/** Thursday, September 24, 2026. */
const now = new Date(2026, 8, 24, 9, 30);

describe("parseDeadline", () => {
  test.each([
    ["today", "2026-09-24"],
    ["Tomorrow", "2026-09-25"],
    ["thu", "2026-09-24"],
    ["fri", "2026-09-25"],
    ["monday", "2026-09-28"],
    ["next week", "2026-09-28"],
    ["next fri", "2026-10-02"],
    ["in 3 days", "2026-09-27"],
    ["2 weeks", "2026-10-08"],
    ["sep 30", "2026-09-30"],
    ["30 September", "2026-09-30"],
    ["Oct 5, 2027", "2027-10-05"],
    ["9/30", "2026-09-30"],
    ["2026-12-01", "2026-12-01"],
  ])("reads %s", (text, expected) => {
    expect(parseDeadline(text, now)).toBe(expected);
  });

  test("puts a month and day already past in next year", () => {
    expect(parseDeadline("sep 1", now)).toBe("2027-09-01");
    expect(parseDeadline("1/15", now)).toBe("2027-01-15");
  });

  test("clears on no deadline, and leaves empty text alone", () => {
    expect(parseDeadline("no deadline", now)).toBeNull();
    expect(parseDeadline("  ", now)).toBeUndefined();
  });

  test("rejects what it cannot read, rather than guessing", () => {
    for (const text of ["someday", "feb 30", "next blursday", "every fri", "13/40"]) {
      expect(parseDeadline(text, now)).toBeUndefined();
    }
  });
});
