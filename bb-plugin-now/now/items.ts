// Merging items from every source into one list. No I/O here.
import type { Item } from "./types.js";

/** Items without a priority sort after every prioritized one. */
function rank(item: Item): number {
  return item.priority ?? 4;
}

/**
 * The date an item sorts by: its due date or its deadline, whichever is
 * sooner. A task matched only by its deadline would otherwise sort as undated.
 */
export function sortDate(item: Item): string | null {
  const due = item.due?.date ?? null;
  if (due === null || item.deadline === null) return due ?? item.deadline;
  return item.deadline < due.slice(0, 10) ? item.deadline : due;
}

/**
 * Soonest due first, undated last. Within a day, most urgent first, then the
 * most recent activity. Ties keep the order the sources gave, since
 * `Array.prototype.sort` is stable.
 *
 * Comparing the date strings directly works because every date starts with
 * `YYYY-MM-DD`; a dated item sorts ahead of a timed one that day.
 */
export function compareItems(a: Item, b: Item): number {
  const aDate = sortDate(a);
  const bDate = sortDate(b);
  if (aDate !== null && bDate !== null && aDate !== bDate) return aDate < bDate ? -1 : 1;
  if (aDate === null && bDate !== null) return 1;
  if (aDate !== null && bDate === null) return -1;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  // Newest activity first, so the latest email leads its source's items.
  if (a.activityAt !== null && b.activityAt !== null && a.activityAt !== b.activityAt) {
    return a.activityAt > b.activityAt ? -1 : 1;
  }
  return 0;
}

export function mergeItems(lists: readonly (readonly Item[])[]): Item[] {
  return lists.flat().sort(compareItems);
}
