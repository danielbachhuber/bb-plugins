// Moving one occurrence of a recurring task to a later day, keeping its rule
// and its time of day. No I/O here.
import { localDay } from "../now/due.js";
import type { Due } from "../now/types.js";

/** `YYYY-MM-DD` plus whole days, on the calendar rather than in hours, so a DST change cannot shift it. */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return localDay(new Date(year!, month! - 1, date! + days));
}

/** The calendar day a due date falls on, in local time for one fixed to a timezone. */
export function dueDay(date: string): string {
  return date.endsWith("Z") ? localDay(new Date(date)) : date.slice(0, 10);
}

/**
 * The due date moved to `day`, in the form it came in: a day stays a day, a
 * floating time keeps its clock, and a time fixed to a timezone keeps its
 * local clock, then goes back to UTC.
 */
export function movedDate(date: string, day: string): string {
  if (!date.includes("T")) return day;
  if (!date.endsWith("Z")) return `${day}${date.slice(10)}`;
  const instant = new Date(date);
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const moved = new Date(year!, month! - 1, dayOfMonth!, instant.getHours(), instant.getMinutes(), instant.getSeconds());
  return moved.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface PostponeChoice {
  label: string;
  day: string;
}

/**
 * The quick picks: a day, two days, and a week after the task is due, or after
 * today when it is already overdue, so no pick leaves it overdue.
 */
export function postponeChoices(due: Due, now: Date): PostponeChoice[] {
  const today = localDay(now);
  const current = dueDay(due.date);
  const from = current > today ? current : today;
  return [
    { label: "A day later", day: addDays(from, 1) },
    { label: "Two days later", day: addDays(from, 2) },
    { label: "A week later", day: addDays(from, 7) },
  ];
}

/** Whether a day is later than the task's date and not in the past, so an overdue task can move to today. */
export function canPostponeTo(due: Due, day: string, now: Date): boolean {
  return day > dueDay(due.date) && day >= localDay(now);
}
