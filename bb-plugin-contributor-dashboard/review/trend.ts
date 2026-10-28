// The trend line drawn over a chart's bars: a trailing moving average.
import type { Bucket, BucketUnit } from "@/dashboard/period";

/** How many buckets the average spans: a week of days, or three weeks or months. */
export const TREND_WINDOW: Record<BucketUnit, number> = { day: 7, week: 3, month: 3 };

/** What the legend calls the line: "3-week average". */
export const TREND_LABEL: Record<BucketUnit, string> = { day: "7-day average", week: "3-week average", month: "3-month average" };

/**
 * Whether the last bucket is still under way, so its count is short: it runs
 * past now, or is shorter than the others because the span ends inside it.
 */
export function lastBucketPartial(buckets: readonly Bucket[], now: number): boolean {
  const last = buckets.at(-1);
  if (last === undefined) return false;
  const full = buckets.length > 1 ? buckets[1].end - buckets[1].start : 0;
  return last.end > now || last.end - last.start < full * 0.9;
}

/**
 * The mean of each bucket and the ones before it, up to `window` of them.
 * The first few average what exists. Buckets from `complete` on get null, so
 * the bucket under way does not bend the line down with its short count.
 */
export function movingAverage(values: readonly number[], window: number, complete: number = values.length): Array<number | null> {
  return values.map((_, i) => {
    if (i >= complete) return null;
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((sum, value) => sum + value, 0) / slice.length;
  });
}
