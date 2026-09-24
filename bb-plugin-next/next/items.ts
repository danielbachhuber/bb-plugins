// Merging items from every source into one list. No I/O here.
import type { Item } from "./types.js";

/** Items without a priority sort after every prioritized one. */
function rank(item: Item): number {
  return item.priority ?? 4;
}

/**
 * Soonest due first, undated last. Within a day, most urgent first. Ties keep
 * the order the sources gave, since `Array.prototype.sort` is stable.
 *
 * Comparing the date strings directly works because every due date starts
 * with `YYYY-MM-DD`; a dated item sorts ahead of a timed one that day.
 */
export function compareItems(a: Item, b: Item): number {
  if (a.due !== null && b.due !== null && a.due.date !== b.due.date) {
    return a.due.date < b.due.date ? -1 : 1;
  }
  if (a.due === null && b.due !== null) return 1;
  if (a.due !== null && b.due === null) return -1;
  return rank(a) - rank(b);
}

export function mergeItems(lists: readonly (readonly Item[])[]): Item[] {
  return lists.flat().sort(compareItems);
}
