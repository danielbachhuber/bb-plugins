import { describe, expect, test } from "vitest";

import type { Item } from "../now/types.js";
import { hasChanges, rowContent, taskChanges } from "./edit.js";

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
    expect(taskChanges(task(), { content: "Order widget samples", due: " next fri ", priority: 2, projectId: "widgets" })).toEqual({
      update: { due_string: "next fri", priority: 3 },
      move: "widgets",
    });
  });

  test("leaves out what the draft did not change, so a recurring date keeps its rule", () => {
    const recurring = task({ priority: 1, due: { date: "2026-09-28", recurring: true, text: "every mon" } });
    expect(taskChanges(recurring, { content: "Order widget samples", due: "", priority: 3, projectId: "inbox" })).toEqual({
      update: { priority: 2 },
      move: null,
    });
  });

  test("sends a new deadline, or null to clear it, apart from the due date", () => {
    expect(taskChanges(task(), { content: "Order widget samples", due: "", deadline: "2026-09-30", priority: 4, projectId: "inbox" }).update).toEqual({
      deadline_date: "2026-09-30",
    });
    const withDeadline = task({ deadline: "2026-09-30" });
    expect(taskChanges(withDeadline, { content: "Order widget samples", due: "", deadline: null, priority: 4, projectId: "inbox" }).update).toEqual({
      deadline_date: null,
    });
    expect(hasChanges(taskChanges(withDeadline, { content: "Order widget samples", due: "", deadline: "2026-09-30", priority: 4, projectId: "inbox" }))).toBe(false);
  });

  test("sends a new name, trimmed, and nothing for the same name or a blank one", () => {
    const draft = { due: "", priority: 4, projectId: "inbox" } as const;
    expect(taskChanges(task(), { ...draft, content: " Order gadget samples " }).update).toEqual({
      content: "Order gadget samples",
    });
    expect(hasChanges(taskChanges(task(), { ...draft, content: "Order widget samples " }))).toBe(false);
    expect(hasChanges(taskChanges(task(), { ...draft, content: "  " }))).toBe(false);
  });

  test("compares the name with Todoist's Markdown, so an untouched link is not sent back as plain text", () => {
    const linked = task({
      title: "Read the widget spec",
      todoist: { projectId: "inbox", content: "Read [the widget spec](https://example.com/spec)" },
    });
    expect(rowContent(linked)).toBe("Read [the widget spec](https://example.com/spec)");
    const draft = { due: "", priority: 4, projectId: "inbox" } as const;
    expect(hasChanges(taskChanges(linked, { ...draft, content: rowContent(linked) }))).toBe(false);
  });

  test("finds nothing to send in an untouched draft", () => {
    expect(hasChanges(taskChanges(task(), { content: "Order widget samples", due: "  ", priority: 4, projectId: "inbox" }))).toBe(false);
  });
});
