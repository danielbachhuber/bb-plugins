// Clearing resolved cards: what is left of a view once the items the user has
// already acted on are taken out.
import { closingItem } from "./closing.js";
import { isQuiet, type Item, type View } from "./schema.js";
import type { StoredView } from "./store.js";

export type ClearPlan =
  /** Nothing to take out. */
  | { kind: "keep"; reason: "nothing-resolved" | "closing-open" }
  /** Every decision is made: take the whole view down. */
  | { kind: "hide"; resolved: Item[] }
  /** Some items are still open: show only them, and the plain list rows. */
  | { kind: "prune"; view: View; resolved: Item[]; open: number };

/** Done or dismissed. A plain list row has nothing to decide, so it is never resolved. */
function isResolved(stored: StoredView, item: Item): boolean {
  if (isQuiet(stored.view, item)) return false;
  const state = stored.items[item.id]?.state ?? "open";
  return state === "done" || state === "dismissed";
}

export function planClear(stored: StoredView, ripe: (item: Item) => boolean = () => true): ClearPlan {
  const items = stored.view.sections.flatMap((section) => section.items);
  const settled = items.filter((item) => isResolved(stored, item));
  const resolved = settled.filter(ripe);
  const open = items.filter((item) => !isQuiet(stored.view, item) && !isResolved(stored, item));
  if (resolved.length === 0) return { kind: "keep", reason: "nothing-resolved" };
  if (open.length === 0 && resolved.length === settled.length) return { kind: "hide", resolved };
  // A closing step's {tally} counts what was done with the other items, so
  // they stay until it is answered.
  const closing = closingItem(stored);
  if (closing !== undefined && open.includes(closing)) return { kind: "keep", reason: "closing-open" };

  const gone = new Set(resolved.map((item) => item.id));
  const sections = stored.view.sections
    .map((section) => ({ ...section, items: section.items.filter((item) => !gone.has(item.id)) }))
    .filter((section) => section.items.length > 0);
  const view: View = { ...stored.view, sections };
  if (stored.view.map !== undefined) {
    const pages = stored.view.map.pages
      .map((page) => ({
        ...page,
        columns: page.columns.map((column) => column.filter((id) => !gone.has(id))).filter((column) => column.length > 0),
      }))
      .filter((page) => page.columns.length > 0);
    if (pages.length > 0) view.map = { ...stored.view.map, pages };
    else delete view.map;
  }
  return { kind: "prune", view, resolved, open: open.length };
}

/**
 * When an item was resolved. One the agent marked complete counts from the
 * publish that marked it, or from the user's last button if that came later.
 */
function resolvedAt(stored: StoredView, item: Item): number {
  const updated = stored.items[item.id]?.updatedAt;
  const published = Date.parse(stored.publishedAt);
  if (updated === undefined) return published;
  return item.status === undefined ? Date.parse(updated) : Math.max(Date.parse(updated), published);
}

/**
 * The view as the cards above the composer show it: without the items
 * resolved at least `afterMs` ago, or null once nothing is left to show.
 * `refreshAt` is when the next resolved item is due to go, if any is. An
 * `afterMs` of 0 shows everything.
 */
export function composerView(
  stored: StoredView,
  nowMs: number,
  afterMs: number,
): { stored: StoredView | null; refreshAt: number | null } {
  if (!(afterMs > 0)) return { stored, refreshAt: null };
  const due = (item: Item) => resolvedAt(stored, item) + afterMs;
  const plan = planClear(stored, (item) => due(item) <= nowMs);
  const items = stored.view.sections.flatMap((section) => section.items);
  const pending = items.filter((item) => isResolved(stored, item) && due(item) > nowMs).map(due);
  const refreshAt = pending.length === 0 ? null : Math.min(...pending);
  if (plan.kind === "keep") return { stored, refreshAt };
  if (plan.kind === "hide") return { stored: null, refreshAt: null };
  return { stored: { ...stored, view: plan.view }, refreshAt };
}
