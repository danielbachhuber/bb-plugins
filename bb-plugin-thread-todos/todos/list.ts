// The list format threads started under Thread Todos read: open items first,
// then done, each with its id. Thread Todos now forwards to Thread Overview,
// and renders Overview's steps through this so those threads see what they
// were told to expect.
//
// Same input, same output. No database, no clock, no bb API.

import type { Todo, TodoStatus } from "./types.js";

/** Open first, then done; each group oldest-first, so new work lands at the end. */
export function orderForDisplay(todos: readonly Todo[]): Todo[] {
  const rank = (status: TodoStatus) => (status === "open" ? 0 : 1);
  return [...todos].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.position - b.position,
  );
}

/** What a tool call reports back, so the model sees ids and current state. */
export function renderForAgent(todos: readonly Todo[]): string {
  const ordered = orderForDisplay(todos);
  if (ordered.length === 0) return "The todo list is empty.";
  const lines = ordered.map(
    (todo) => `${todo.status === "done" ? "[x]" : "[ ]"} ${todo.id}  ${todo.text}`,
  );
  const open = ordered.filter((todo) => todo.status === "open").length;
  return `${lines.join("\n")}\n\n${open} open of ${ordered.length}.`;
}
