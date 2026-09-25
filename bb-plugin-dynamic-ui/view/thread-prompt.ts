// What a thread started from an item begins with: the item's title, link,
// summary, and details, so the new thread can dig in without going back to the
// one that published it. Not the draft: that is the publishing thread's answer,
// and the new thread is there to work one out.
import type { Item } from "./schema.js";

/** The prompt the new-thread composer starts with. The user edits it before starting. */
export function itemThreadPrompt(viewTitle: string, item: Item, sourceThreadId: string): string {
  const parts = [
    `Dig further into this item from "${viewTitle}" in @thread:${sourceThreadId}.`,
    item.url === undefined ? `## ${item.title}` : `## ${item.title}\n\n${item.url}`,
  ];
  if (item.summary.trim() !== "") parts.push(item.summary.trim());
  if (item.details.trim() !== "") parts.push(item.details.trim());
  return parts.join("\n\n");
}
