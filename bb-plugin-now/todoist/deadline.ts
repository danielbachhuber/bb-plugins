// A deadline typed in words, read into a calendar day. Todoist parses a due
// date's words itself, but its API takes a deadline only as `YYYY-MM-DD`, so
// this reads the common forms here. Pure, with "today" passed in.
import { localDay } from "../now/due.js";

/** A day to set, null to clear the deadline, or undefined when the words are not a date. */
export type ParsedDeadline = string | null | undefined;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const CLEAR = new Set(["no deadline", "no date", "none", "clear"]);

/** A name, or at least its first three letters: "fri", "friday", "sept". */
function nameIndex(names: readonly string[], word: string): number {
  if (word.length < 3) return -1;
  return names.findIndex((name) => name.startsWith(word));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** A real day of the month, or null for "feb 30". */
function dayOf(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  return date.getMonth() === month && date.getDate() === day ? date : null;
}

/** A month and day with no year: this year's, or next year's once this year's has passed. */
function nextMonthDay(month: number, day: number, today: Date): Date | null {
  const thisYear = dayOf(today.getFullYear(), month, day);
  if (thisYear === null) return dayOf(today.getFullYear() + 1, month, day);
  return thisYear < today ? dayOf(today.getFullYear() + 1, month, day) : thisYear;
}

/**
 * "today", "tomorrow", a weekday ("fri", the next one, today included), "next
 * fri" (next week's), "next week" (next Monday), "in 3 days", "2 weeks",
 * "sep 30", "30 sep", "9/30", or "2026-09-30". "no deadline" clears it.
 */
export function parseDeadline(text: string, now: Date): ParsedDeadline {
  const words = text.trim().toLowerCase().replace(/\s+/g, " ").replace(/,/g, "");
  if (words === "") return undefined;
  if (CLEAR.has(words)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (date: Date | null) => (date === null ? undefined : localDay(date));

  if (words === "today" || words === "tod") return day(today);
  if (words === "tomorrow" || words === "tom") return day(addDays(today, 1));

  const iso = words.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return day(dayOf(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));

  const slash = words.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (slash) {
    const month = Number(slash[1]) - 1;
    const date = Number(slash[2]);
    if (slash[3] === undefined) return day(nextMonthDay(month, date, today));
    const year = Number(slash[3]) + (slash[3].length === 2 ? 2000 : 0);
    return day(dayOf(year, month, date));
  }

  const offset = words.match(/^(?:in )?(\d{1,3}) (day|days|week|weeks)$/);
  if (offset) return day(addDays(today, Number(offset[1]) * (offset[2]!.startsWith("week") ? 7 : 1)));

  if (words === "next week") return day(addDays(today, ((8 - today.getDay()) % 7) || 7));

  const next = words.match(/^next (\w+)$/);
  if (next) {
    const weekday = nameIndex(WEEKDAYS, next[1]!);
    if (weekday === -1) return undefined;
    const nextMonday = addDays(today, ((8 - today.getDay()) % 7) || 7);
    return day(addDays(nextMonday, (weekday + 6) % 7));
  }

  const weekday = nameIndex(WEEKDAYS, words);
  if (weekday !== -1) return day(addDays(today, (weekday - today.getDay() + 7) % 7));

  const monthFirst = words.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/);
  const dayFirst = words.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/);
  const parts = monthFirst
    ? { month: monthFirst[1]!, date: monthFirst[2]!, year: monthFirst[3] }
    : dayFirst
      ? { month: dayFirst[2]!, date: dayFirst[1]!, year: dayFirst[3] }
      : null;
  if (parts) {
    const month = nameIndex(MONTHS, parts.month);
    if (month === -1) return undefined;
    if (parts.year !== undefined) return day(dayOf(Number(parts.year), month, Number(parts.date)));
    return day(nextMonthDay(month, Number(parts.date), today));
  }

  return undefined;
}
