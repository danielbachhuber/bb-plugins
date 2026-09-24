// Thread Todos' rows, as its `todos_export` RPC returns them, turned into
// steps. Pure, so the mapping is tested without either plugin running.

import { z } from "zod";
import type { Step } from "./types.js";

export const THREAD_TODOS_PLUGIN_ID = "thread-todos";

/** The meta key that records the import ran, and what it copied. */
export const IMPORT_META_KEY = "imported-thread-todos";

export const exportedTodoSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  text: z.string(),
  status: z.enum(["open", "done"]),
  source: z.enum(["agent", "user"]),
  position: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const todosExportSchema = z.object({ todos: z.array(exportedTodoSchema) });

export type ExportedTodo = z.infer<typeof exportedTodoSchema>;

/** Open becomes todo, done stays done; nothing becomes current. */
export function stepsFromTodos(todos: readonly ExportedTodo[]): Step[] {
  return todos.map((todo) => ({
    ...todo,
    status: todo.status === "done" ? "done" : "todo",
  }));
}
