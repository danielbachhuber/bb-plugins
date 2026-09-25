// What one Save on a Todoist row's edit strip asks of Todoist. No I/O here.
import type { Item } from "../now/types.js";
import type { TaskUpdate } from "./api.js";
import { apiPriority } from "./normalize.js";

/** What the edit strip holds when Save is pressed. */
export interface TaskDraft {
  /** A date in words. Empty leaves the date as it is. */
  due: string;
  /** The day the deadline moves to, null to clear it, or absent to leave it as it is. */
  deadline?: string | null;
  /** 4 is no priority, as Todoist's app counts. */
  priority: 1 | 2 | 3 | 4;
  projectId: string | null;
}

export interface TaskChanges {
  update: TaskUpdate | null;
  /** The project to move it to, or null to leave it where it is. */
  move: string | null;
}

/** The draft's priority, or the row's own when the draft has none. */
export function rowPriority(item: Item): 1 | 2 | 3 | 4 {
  return item.priority ?? 4;
}

/** Only what the draft changed, so an untouched recurring date keeps its rule. */
export function taskChanges(item: Item, draft: TaskDraft): TaskChanges {
  const update: TaskUpdate = {};
  const due = draft.due.trim();
  if (due !== "") update.due_string = due;
  if (draft.deadline !== undefined && draft.deadline !== item.deadline) update.deadline_date = draft.deadline;
  if (draft.priority !== rowPriority(item)) update.priority = apiPriority(draft.priority);
  const current = item.todoist?.projectId ?? null;
  const move = draft.projectId !== null && draft.projectId !== current ? draft.projectId : null;
  return { update: Object.keys(update).length === 0 ? null : update, move };
}

export function hasChanges(changes: TaskChanges): boolean {
  return changes.update !== null || changes.move !== null;
}
