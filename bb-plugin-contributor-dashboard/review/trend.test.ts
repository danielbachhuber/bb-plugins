import { describe, expect, it } from "vitest";

import { lastBucketPartial, movingAverage } from "./trend";

const DAY = 86_400_000;
const week = (i: number, length = 7) => ({ start: i * 7 * DAY, end: i * 7 * DAY + length * DAY, label: `w${i}` });

describe("movingAverage", () => {
  it("averages each bucket with the ones before it, up to the window", () => {
    expect(movingAverage([3, 6, 9, 12], 3)).toEqual([3, 4.5, 6, 9]);
  });

  it("leaves off the buckets from complete on", () => {
    expect(movingAverage([4, 8, 2], 3, 2)).toEqual([4, 6, null]);
  });

  it("draws nothing for an empty series", () => {
    expect(movingAverage([], 3)).toEqual([]);
  });
});

describe("lastBucketPartial", () => {
  it("is true when the last bucket runs past now", () => {
    expect(lastBucketPartial([week(0), week(1)], 10 * DAY)).toBe(true);
  });

  it("is true when the span ends inside the last bucket", () => {
    expect(lastBucketPartial([week(0), week(1), week(2, 2)], 100 * DAY)).toBe(true);
  });

  it("is false once the last bucket has ended", () => {
    expect(lastBucketPartial([week(0), week(1)], 100 * DAY)).toBe(false);
  });

  it("is false with no buckets", () => {
    expect(lastBucketPartial([], 0)).toBe(false);
  });
});
