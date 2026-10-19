/**
 * An inline view: each item is one question, answered right above the
 * composer with one of its buttons or with the user's own words in the field
 * under them. No network or bb calls, so the banner, the server, and the tests
 * share it.
 */
import type { Item } from "./schema.js";
import type { ActionResult, StoredView } from "./store.js";

/** What an answer typed into the field is recorded as, in place of a button's label. */
export const INLINE_REPLY_LABEL = "Something else";

/** The message an answer in the user's own words sends, with the question so the agent knows what it answers. */
export function inlineReplyMessage(item: Item, text: string): string {
  return `${item.title}\n\n${text}`;
}

/** The questions, in the order published. */
export function questions(stored: StoredView): Item[] {
  return stored.view.sections.flatMap((section) => section.items);
}

/**
 * The count beside an inline view's title: how many questions wait on the
 * user, then how many are answered.
 */
export function inlineProgress(stored: StoredView): string {
  const all = questions(stored);
  const answered = all.filter((item) => stored.items[item.id]?.state === "done").length;
  if (answered === all.length) return "answered";
  if (answered === 0) return all.length === 1 ? "1 question" : `${all.length} questions`;
  return `${answered} of ${all.length} answered`;
}

/** The answer as it reads in the green banner: the button's label, or the user's words in quotes. */
export function answerText(result: ActionResult): string {
  return result.label === INLINE_REPLY_LABEL && result.draft !== undefined ? `“${result.draft}”` : result.label;
}
