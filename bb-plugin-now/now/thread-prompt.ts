// What a thread started from a row opens with in bb's composer. No I/O here.
import type { Item } from "./types.js";

const SOURCE_NAME: Record<string, string> = { todoist: "Todoist", gmail: "Gmail" };

/** Where a row came from, in words, for the prompt and the dialog's card. */
export function itemOrigin(item: Item): string {
  if (item.github !== null) {
    const kind = item.github.kind === "pull" ? "pull request" : "issue";
    return `GitHub ${kind} ${item.github.repo}#${item.github.number}`;
  }
  if (item.doc != null) return `Comments on ${item.context ?? "a Google document"}`;
  const source = SOURCE_NAME[item.source] ?? item.source;
  if (item.source === "todoist") return item.context === null ? "Todoist task" : `Todoist task in ${item.context}`;
  if (item.source === "gmail") return item.context === null ? "Email" : `Email from ${item.context}`;
  return source;
}

/**
 * The facts about the row, then a blank line for what the thread should do.
 * Facts only: the user writes the ask, so nothing here steers the agent.
 */
export function threadPrompt(item: Item): string {
  const lines = [`${itemOrigin(item)}: ${item.title}`, item.url];
  if (item.due !== null) lines.push(`Due: ${item.due.date}${item.due.recurring ? " (recurring)" : ""}`);
  if (item.deadline !== null) lines.push(`Deadline: ${item.deadline}`);
  if (item.description !== "") lines.push("", item.description);
  const comment = item.github?.comment ?? null;
  if (comment !== null) lines.push("", `Latest comment${comment.author === null ? "" : ` from ${comment.author}`}: ${comment.text}`);
  for (const quote of item.doc?.quotes ?? []) lines.push("", `${quote.author ?? "Someone"}: ${quote.text}`);
  return `${lines.join("\n")}\n\n`;
}
