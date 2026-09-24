// When a snooze ends, and which items it is hiding. No I/O here.
import type { Snooze } from "./store.js";
import type { Item } from "./types.js";

export interface SnoozeChoice {
  label: string;
  /** ISO 8601. */
  until: string;
}

/** Snoozes to a day end at this hour, local time. */
const MORNING_HOUR = 8;

function morning(date: Date, plusDays: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + plusDays);
  next.setHours(MORNING_HOUR, 0, 0, 0);
  return next;
}

/**
 * The menu's choices, in the viewer's local time: three hours from now,
 * tomorrow morning, and next Monday morning. On a Monday, next week is a week
 * away rather than this morning.
 */
export function snoozeChoices(now: Date): SnoozeChoice[] {
  const daysToMonday = ((8 - now.getDay()) % 7) || 7;
  return [
    { label: "Later today", until: new Date(now.getTime() + 3 * 3_600_000).toISOString() },
    { label: "Tomorrow", until: morning(now, 1).toISOString() },
    { label: "Next week", until: morning(now, daysToMonday).toISOString() },
  ];
}

export interface SnoozedItem {
  item: Item;
  until: string;
}

/**
 * The items to show and the ones a snooze is hiding. A snooze stops hiding
 * its item once it runs out, and as soon as the item has activity newer than
 * when it was snoozed: a new comment on a snoozed pull request is worth
 * seeing now.
 */
export function partitionSnoozed(
  items: readonly Item[],
  snoozes: ReadonlyMap<string, Snooze>,
  now: Date,
): { active: Item[]; snoozed: SnoozedItem[] } {
  const active: Item[] = [];
  const snoozed: SnoozedItem[] = [];
  const at = now.toISOString();

  for (const item of items) {
    const snooze = snoozes.get(item.id);
    const newer =
      snooze !== undefined && item.activityAt !== null && (snooze.activityAt === null || item.activityAt > snooze.activityAt);
    if (snooze === undefined || snooze.until <= at || newer) active.push(item);
    else snoozed.push({ item, until: snooze.until });
  }
  return { active, snoozed };
}
