// The closing step: the item that comes after all the others, such as a
// review's verdict. Pure, so the banner, the panel, and the server agree on
// what is left and what was done.
import type { Item } from "./schema.js";
import type { StoredView } from "./store.js";

export function closingItem(stored: StoredView): Item | undefined {
  return stored.view.sections.flatMap((section) => section.items).find((item) => item.closing);
}

/** Every item but the closing step. */
export function stepsBefore(stored: StoredView): Item[] {
  return stored.view.sections.flatMap((section) => section.items).filter((item) => !item.closing);
}

/** How many items before the closing step are still open. */
export function openBeforeClosing(stored: StoredView): number {
  return stepsBefore(stored).filter((item) => (stored.items[item.id]?.state ?? "open") === "open").length;
}

/**
 * What was done with the items before the closing step, in the order it first
 * happened: "2 Attach as draft comment, 1 Create issue, 1 dismissed".
 */
export function tally(stored: StoredView): string {
  const counts = new Map<string, number>();
  for (const item of stepsBefore(stored)) {
    const record = stored.items[item.id];
    const state = record?.state ?? "open";
    const key = state === "dismissed" ? "dismissed" : state === "open" ? "open" : (record?.result?.label ?? "done");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([label, count]) => `${count} ${label}`).join(", ");
}

/** The closing step's summary or a button's text, with `{tally}` filled in. */
export function fillTally(text: string, stored: StoredView): string {
  return text.includes("{tally}") ? text.replaceAll("{tally}", tally(stored)) : text;
}
