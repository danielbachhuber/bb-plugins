// What span the page is reading, and the days, weeks, or months it is drawn
// in. Times are local: a week starts at Monday midnight where the server runs.

export type PresetId = "2w" | "6w" | "3m";

export const PRESETS: ReadonlyArray<{ id: PresetId; label: string }> = [
  { id: "2w", label: "2 weeks" },
  { id: "6w", label: "6 weeks" },
  { id: "3m", label: "3 months" },
];

export const DEFAULT_PRESET: PresetId = "6w";

// A preset is a number of whole buckets ending with the one in progress, so
// six weeks is six points rather than however many weeks forty-two days
// happens to touch.
const PRESET_SPANS: Record<PresetId, { unit: "day" | "week"; count: number; words: string }> = {
  "2w": { unit: "day", count: 14, words: "two weeks" },
  "6w": { unit: "week", count: 6, words: "six weeks" },
  "3m": { unit: "week", count: 13, words: "three months" },
};

/** Either one of the buttons, or two dates someone picked. */
export type Selection = { kind: "preset"; id: PresetId } | { kind: "custom"; from: number; to: number };

export const DEFAULT_SELECTION: Selection = { kind: "preset", id: DEFAULT_PRESET };

/** Inclusive start, exclusive end, epoch ms. */
export interface Range {
  from: number;
  to: number;
}

/** How far back the first sync reaches: long enough for a year-long range and the one before it. */
export const BACKFILL_MS = 2 * 366 * 24 * 3_600_000;

const DAY_MS = 24 * 3_600_000;

/** The span a selection asks for, with a preset measured back from now. */
export function rangeOf(selection: Selection, now: number): Range {
  if (selection.kind === "custom") return { from: selection.from, to: selection.to };
  const { unit, count } = PRESET_SPANS[selection.id];
  const from = unit === "day" ? startOfDay(now) : mondayOf(now);
  if (unit === "day") from.setDate(from.getDate() - (count - 1));
  else from.setDate(from.getDate() - (count - 1) * 7);
  return { from: from.getTime(), to: now };
}

/** How a sentence names the span: "over six weeks", "over Sep 19 to Oct 9". */
export function selectionWords(selection: Selection): string {
  if (selection.kind === "preset") return PRESET_SPANS[selection.id].words;
  const day = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  // The end is exclusive, so the last day a sentence should name is the one
  // before it, which is also what the picker's own button says.
  return `${day(selection.from)} to ${day(selection.to - 1)}`;
}

export interface Bucket {
  /** Inclusive, epoch ms. */
  start: number;
  /** Exclusive, epoch ms. The last bucket ends where the range does. */
  end: number;
  label: string;
}

/** What one point on a chart counts. */
export type BucketUnit = "day" | "week" | "month";

// A chart wants somewhere between a handful and a few dozen points, so the
// unit follows the span: about a month of days, about half a year of weeks,
// months beyond that.
const WEEKS_ABOVE_DAYS = 31;
const MONTHS_ABOVE_WEEKS = 183;

/** Whether the range's points are days, weeks, or months. */
export function bucketUnitFor({ from, to }: Range): BucketUnit {
  const days = Math.max(1, Math.round((to - from) / DAY_MS));
  if (days <= WEEKS_ABOVE_DAYS) return "day";
  if (days <= MONTHS_ABOVE_WEEKS) return "week";
  return "month";
}

function startOfDay(at: number): Date {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day;
}

function mondayOf(at: number): Date {
  const day = startOfDay(at);
  // getDay(): Sunday is 0, so Sunday belongs to the week that began six days earlier.
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function firstOfMonth(at: number): Date {
  const day = startOfDay(at);
  day.setDate(1);
  return day;
}

/**
 * The range's buckets, oldest first, the last one ending where the range
 * does. A bucket is a whole day, week, or month, so a range starting midweek
 * is charted from that week's Monday rather than as a short first point.
 */
export function bucketsFor(range: Range, unit: BucketUnit = bucketUnitFor(range)): Bucket[] {
  const starts: Date[] = [];
  const cursor = unit === "day" ? startOfDay(range.from) : unit === "week" ? mondayOf(range.from) : firstOfMonth(range.from);
  while (cursor.getTime() < range.to) {
    starts.push(new Date(cursor));
    if (unit === "day") cursor.setDate(cursor.getDate() + 1);
    else if (unit === "week") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  if (starts.length === 0) starts.push(startOfDay(range.from));
  return starts.map((start, index) => ({
    start: start.getTime(),
    end: index + 1 < starts.length ? starts[index + 1].getTime() : range.to,
    label:
      unit === "month"
        ? start.toLocaleDateString("en-US", { month: "short" })
        : start.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));
}

/** The bucket `at` falls in, or -1 when it is outside the range. */
export function bucketIndex(buckets: readonly Bucket[], at: number): number {
  return buckets.findIndex((bucket) => at >= bucket.start && at < bucket.end);
}

/**
 * What the buckets a server sent are counting, read back from their own
 * length so a page does not have to recompute the range to find out.
 */
export function unitOfBuckets(buckets: readonly Bucket[]): BucketUnit {
  const first = buckets[0];
  if (first === undefined) return "day";
  const days = (first.end - first.start) / DAY_MS;
  return days > 20 ? "month" : days > 3 ? "week" : "day";
}
