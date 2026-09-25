import { describe, expect, test } from "vitest";

import type { Item } from "../now/types.js";
import { hasChanges, taskChanges } from "./edit.js";

function task(overrides: Partial<Item> = {}): Item {
  return {
    id: "todoist:a",
    source: "todoist",
    title: "Order widget samples",
    description: "",
    priority: null,
    due: null,
    deadline: null,
    activityAt: null,
    context: "Inbox",
    inbox: true,
    tags: [],
    url: "https://app.todoist.com/app/task/a",
    gmail: null,
    github: null,
    todoist: { projectId: "inbox" },
    ...overrides,
  };
}

describe("taskChanges", () => {
  test("sends the typed date, the priority on Todoist's scale, and the move together", () => {
    expect(taskChanges(task(), { due: " next fri ", priority: 2, projectId: "widgets" })).toEqual({
      update: { due_string: "next fri", priority: 3 },
      move: "widgets",
    });
  });

  test("leaves out what the draft did not change, so a recurring date keeps its rule", () => {
    const recurring = task({ priority: 1, due: { date: "2026-09-28", recurring: true, text: "every mon" } });
    expect(taskChanges(recurring, { due: "", priority: 3, projectId: "inbox" })).toEqual({
      update: { priority: 2 },
      move: null,
    });
  });

  test("sends a new deadline, or null to clear it, apart from the due date", () => {
    expect(taskChanges(task(), { due: "", deadline: "2026-09-30", priority: 4, projectId: "inbox" }).update).toEqual({
      deadline_date: "2026-09-30",
    });
    const withDeadline = task({ deadline: "2026-09-30" });
    expect(taskChanges(withDeadline, { due: "", deadline: null, priority: 4, projectId: "inbox" }).update).toEqual({
      deadline_date: null,
    });
    expect(hasChanges(taskChanges(withDeadline, { due: "", deadline: "2026-09-30", priority: 4, projectId: "inbox" }))).toBe(false);
  });

  test("finds nothing to send in an untouched draft", () => {
    expect(hasChanges(taskChanges(task(), { due: "  ", priority: 4, projectId: "inbox" }))).toBe(false);
  });
});
