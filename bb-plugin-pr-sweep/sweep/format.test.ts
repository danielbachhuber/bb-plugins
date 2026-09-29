import { describe, expect, it } from "vitest";
import { checksLabel, relativeTime } from "./format.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("rounds every unit down", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("just now");
    expect(relativeTime(NOW - 3 * HOUR - 1, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe("2d ago");
    expect(relativeTime(NOW - 15 * DAY, NOW)).toBe("2w ago");
  });
});

describe("checksLabel", () => {
  it("leads with the counts that matter and leaves out zeroes", () => {
    expect(checksLabel({ pass: 7, fail: 2, skip: 0, pending: 1, cancelled: 0, total: 10 })).toBe(
      "2 fail, 1 running, 7 pass",
    );
  });

  it("says so when there are no checks", () => {
    expect(checksLabel({ pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 0 })).toBe("no checks");
  });
});
