// The periods the page offers, and the weeks or months each is drawn in.
// Times are local: a week starts at Monday midnight where the server runs.

export type PeriodId = "1w" | "3w" | "6w" | "12w" | "6m" | "1y";

export const PERIODS: ReadonlyArray<{ id: PeriodId; label: string }> = [
  { id: "1w", label: "1 week" },
  { id: "3w", label: "3 weeks" },
  { id: "6w", label: "6 weeks" },
  { id: "12w", label: "12 weeks" },
  { id: "6m", label: "6 months" },
  { id: "1y", label: "1 year" },
];

export const DEFAULT_PERIOD: PeriodId = "6w";

/** The period's length as a sentence reads it: "over six weeks". */
export const PERIOD_LENGTHS: Record<PeriodId, string> = {
  "1w": "a week",
  "3w": "three weeks",
  "6w": "six weeks",
  "12w": "twelve weeks",
  "6m": "six months",
  "1y": "a year",
};

/** How far back the first sync reaches: the longest period and the one before it. */
export const BACKFILL_MS = 2 * 366 * 24 * 3_600_000;

export interface Bucket {
  /** Inclusive, epoch ms. */
  start: number;
  /** Exclusive, epoch ms. The last bucket ends now. */
  end: number;
  label: string;
}

/** What one point on a chart counts. */
export type BucketUnit = "day" | "week" | "month";

// The short periods are drawn by day: a week split into weeks is a single
// point, which no line can be drawn through.
const SHAPE: Record<PeriodId, { unit: BucketUnit; count: number }> = {
  "1w": { unit: "day", count: 7 },
  "3w": { unit: "day", count: 21 },
  "6w": { unit: "week", count: 6 },
  "12w": { unit: "week", count: 12 },
  "6m": { unit: "month", count: 6 },
  "1y": { unit: "month", count: 12 },
};

/** Whether the period's points are days, weeks, or months. */
export const bucketUnitOf = (period: PeriodId): BucketUnit => SHAPE[period].unit;

function startOfDay(now: number): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

function mondayOf(now: number): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  // getDay(): Sunday is 0, so Sunday belongs to the week that began six days earlier.
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function firstOfMonth(now: number): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(1);
  return day;
}

/** The period's buckets, oldest first, the last one running up to `now`. */
export function bucketsFor(period: PeriodId, now: number): Bucket[] {
  const { unit, count } = SHAPE[period];
  const starts: Date[] = [];
  const current = unit === "day" ? startOfDay(now) : unit === "week" ? mondayOf(now) : firstOfMonth(now);
  for (let back = count - 1; back >= 0; back--) {
    const start = new Date(current);
    if (unit === "day") start.setDate(start.getDate() - back);
    else if (unit === "week") start.setDate(start.getDate() - back * 7);
    else start.setMonth(start.getMonth() - back);
    starts.push(start);
  }
  return starts.map((start, index) => ({
    start: start.getTime(),
    end: index + 1 < starts.length ? starts[index + 1].getTime() : now,
    label:
      unit === "month"
        ? start.toLocaleDateString("en-US", { month: "short" })
        : start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}

/** The bucket `at` falls in, or -1 when it is outside the period. */
export function bucketIndex(buckets: readonly Bucket[], at: number): number {
  return buckets.findIndex((bucket) => at >= bucket.start && at < bucket.end);
}
