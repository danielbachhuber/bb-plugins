/**
 * What a scheduled run gathers. Pure: it is given the clock and the recent
 * gathers, and returns the weeks to gather in order.
 */
import { addDays, resolveRange, toDay, type Range } from "./dates.js";
import { SOURCE_NAMES, type GatherRow } from "./db.js";

export interface PlannedGather {
  range: Range;
  includeDocs: boolean;
}

/**
 * The current week always. Reference docs only on the day's first run that
 * reaches them, since each one is its own Google request and they rarely
 * change within a day.
 *
 * On a Monday, the previous week first, once: the last run of a week is
 * Friday afternoon, so time logged after it would otherwise never be
 * gathered. Its docs are left as they were.
 */
export function plannedGathers(now: Date, recent: GatherRow[]): PlannedGather[] {
  const today = toDay(now);
  const current = resolveRange(undefined, undefined, now);
  const startedToday = (gather: GatherRow) => toDay(new Date(gather.startedAt)) === today;
  const docsToday = recent.some(
    (gather) =>
      startedToday(gather) && gather.sources.some((source) => source.name === SOURCE_NAMES.docs),
  );

  const planned: PlannedGather[] = [];
  if (now.getDay() === 1) {
    const previous = mondayBefore(current.from);
    const latest = recent.find((gather) => gather.monday === previous);
    if (latest === undefined || !startedToday(latest)) {
      planned.push({ range: wholeWeek(previous), includeDocs: false });
    }
  }
  planned.push({ range: current, includeDocs: !docsToday });
  return planned;
}

function mondayBefore(monday: string): string {
  return addDays(monday, -7);
}

function wholeWeek(monday: string): Range {
  return { from: monday, to: addDays(monday, 6) };
}

