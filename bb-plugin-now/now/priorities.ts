// The week's priorities, written in by another plugin (Weekly Review, from the
// journal's Next: bullets) and checked off here. Pure, so the merge that keeps
// a checked priority checked across rewrites is tested on its own.
import { z } from "zod";

export const mondaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One priority as a writer sends it. */
export const priorityInputSchema = z.object({
  /** The top-level bullet. Also how a rewrite finds its checked state. */
  text: z.string().trim().min(1).max(2000),
  /** Bullets nested under it. */
  details: z.array(z.string().max(2000)).max(50),
  /** Hours spent on it this week, or null when nothing measures it. */
  hours: z.number().nonnegative().nullable(),
});

export const storedPrioritySchema = priorityInputSchema.extend({
  /** When it was checked off, or null. */
  doneAt: z.string().nullable(),
});

export const priorityWeekSchema = z.object({
  monday: mondaySchema,
  /** The plugin that wrote the list. */
  source: z.string(),
  /** Where the list came from, such as the journal entry's heading. */
  heading: z.string().nullable(),
  /** When the hours were worked out, or null when there are none. */
  hoursAt: z.string().nullable(),
  writtenAt: z.string(),
  items: z.array(storedPrioritySchema),
});

export type PriorityInput = z.infer<typeof priorityInputSchema>;
export type StoredPriority = z.infer<typeof storedPrioritySchema>;
export type PriorityWeek = z.infer<typeof priorityWeekSchema>;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The Monday of the week `date` falls in, in local time. Sunday ends a week. */
export function mondayOf(date: Date): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/**
 * The new list, in its order, with each priority's checked state carried over
 * from a stored one with the same text. A reworded priority starts unchecked.
 */
export function mergeDone(stored: readonly StoredPriority[], incoming: readonly PriorityInput[]): StoredPriority[] {
  const done = new Map(stored.map((each) => [each.text.trim(), each.doneAt]));
  return incoming.map((each) => {
    const text = each.text.trim();
    return { text, details: [...each.details], hours: each.hours, doneAt: done.get(text) ?? null };
  });
}

export function doneCount(items: readonly StoredPriority[]): number {
  return items.filter((each) => each.doneAt !== null).length;
}

/** "6.5h", "No time yet" for a measured priority with none, or null when nothing measures it. */
export function hoursLabel(hours: number | null): string | null {
  if (hours === null) return null;
  if (hours === 0) return "No time yet";
  return `${Math.round(hours * 10) / 10}h`;
}

/** "hours as of 1:05 PM", with the weekday when it was not today. Null with no hours. */
export function hoursAsOf(hoursAt: string | null, now: Date): string | null {
  if (hoursAt === null) return null;
  const at = new Date(hoursAt);
  if (Number.isNaN(at.getTime())) return null;
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const sameDay = at.toDateString() === now.toDateString();
  return sameDay ? `hours as of ${time}` : `hours as of ${at.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}

/** "Week of Oct 5" for a Monday. */
export function weekLabel(monday: string): string {
  const [year, month, day] = monday.split("-").map(Number) as [number, number, number];
  return `Week of ${new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
