// Elapsed time with weekends left out.
//
// A review that lands Monday morning did not take three days because the pull
// request opened on Friday afternoon. Saturdays and Sundays are skipped
// whole; the hours within a weekday all count, because people in different
// time zones work different hours and the mirror has no way to know theirs.

const DAY_MS = 24 * 3_600_000;

/** Local midnight at the start of `at`'s day. */
function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

const isWeekend = (at: number) => {
  const day = new Date(at).getDay();
  return day === 0 || day === 6;
};

/** Business days between two epoch times, as a fraction. 0 when `end` is not after `start`. */
export function businessDaysBetween(start: number, end: number): number {
  if (end <= start) return 0;
  let total = 0;
  for (let day = startOfDay(start); day < end; day = startOfDay(day + DAY_MS + 3_600_000)) {
    if (isWeekend(day)) continue;
    // Daylight saving makes a day 23 or 25 hours long; the next day's local
    // midnight is the true end of this one.
    const dayEnd = startOfDay(day + DAY_MS + 3_600_000);
    const from = Math.max(day, start);
    const to = Math.min(dayEnd, end);
    if (to > from) total += (to - from) / (dayEnd - day);
  }
  return total;
}
