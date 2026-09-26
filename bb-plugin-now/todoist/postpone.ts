// Moving a task's date to a later day: one occurrence of a recurring task,
// keeping its rule and its time of day, or a one-off due date or deadline that
// has come. No I/O here.
import { localDay } from "../now/due.js";
import type { Due, Item } from "../now/types.js";

/**
 * What Postpone moves on a row: the current occurrence of a recurring task,
 * a one-off due date that is today or past, or else a deadline that is.
 */
export type PostponeTarget =
  | { kind: "occurrence"; due: Due & { text: string } }
  | { kind: "due"; due: Due }
  | { kind: "deadline"; due: Due };

/** What Postpone would move on a row, or null when it offers nothing there. */
export function postponeTarget(item: Pick<Item, "due" | "deadline">, now: Date): PostponeTarget | null {
  const today = localDay(now);
  const { due, deadline } = item;
  if (due?.recurring) return due.text === undefined ? null : { kind: "occurrence", due: { ...due, text: due.text } };
  if (due !== null && dueDay(due.date) <= today) return { kind: "due", due };
  if (deadline !== null && deadline <= today) return { kind: "deadline", due: { date: deadline, recurring: false } };
  return null;
}

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
 * The quick picks: a day, two days, and a week after the task is due. An
 * overdue task counts from today instead, and can move to today itself, so no
 * pick leaves it overdue.
 */
export function postponeChoices(due: Due, now: Date): PostponeChoice[] {
  const today = localDay(now);
  if (dueDay(due.date) < today) {
    return [
      { label: "Today", day: today },
      { label: "Tomorrow", day: addDays(today, 1) },
      { label: "In a week", day: addDays(today, 7) },
    ];
  }
  const from = dueDay(due.date);
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
