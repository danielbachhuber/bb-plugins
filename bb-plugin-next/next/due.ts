// How a due date reads in the list. Pure, with "today" passed in.
import type { Due } from "./types.js";

export type DueTone = "overdue" | "today" | "upcoming";

export interface DueLabel {
  text: string;
  tone: DueTone;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The local calendar day of a Date, as `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The local day and time a due value names. A trailing `Z` means Todoist
 * fixed the time to a timezone, so it is converted; without it the time is
 * already local ("floating").
 */
function resolve(due: Due): { day: string; time: string | null } {
  if (!due.date.includes("T")) return { day: due.date, time: null };

  if (due.date.endsWith("Z")) {
    const instant = new Date(due.date);
    const hours = String(instant.getHours()).padStart(2, "0");
    const minutes = String(instant.getMinutes()).padStart(2, "0");
    return { day: localDay(instant), time: `${hours}:${minutes}` };
  }

  const [day, time] = due.date.split("T");
  return { day: day!, time: time!.slice(0, 5) };
}

/** Whole days from one `YYYY-MM-DD` to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function calendarText(day: string, today: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const text = `${MONTHS[month! - 1]} ${date}`;
  return year === Number(today.slice(0, 4)) ? text : `${text}, ${year}`;
}

export function describeDue(due: Due, now: Date): DueLabel {
  const today = localDay(now);
  const { day, time } = resolve(due);
  const offset = daysBetween(today, day);

  let text: string;
  if (offset === 0) text = "Today";
  else if (offset === 1) text = "Tomorrow";
  else if (offset === -1) text = "Yesterday";
  else if (offset > 1 && offset < 7) text = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]!;
  else text = calendarText(day, today);

  if (time !== null) text = `${text} ${time}`;

  const tone: DueTone = offset < 0 ? "overdue" : offset === 0 ? "today" : "upcoming";
  return { text, tone };
}
