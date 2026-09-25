import { describe, expect, test } from "vitest";

import { apiPriority, normalizeTask, normalizeTasks, plainContent, projectMap, projectTree } from "./normalize.js";

/** The fields the v1 `tasks/filter` endpoint returns that normalization reads. */
function rawTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "6XGgmFVcrG5RRjVr",
    project_id: "p1",
    content: "Buy widgets",
    description: "",
    checked: false,
    is_deleted: false,
    priority: 1,
    due: null,
    deadline: null,
    labels: [],
    ...overrides,
  };
}

const projects = projectMap([
  { id: "p1", name: "Widgets" },
  { id: "p2", name: "Gadgets" },
  { id: "p0", name: "Inbox", inbox_project: true },
]);

describe("plainContent", () => {
  test("keeps a link's text and drops its target", () => {
    expect(plainContent("Read [the widget spec](https://example.com/spec)")).toBe("Read the widget spec");
  });

  test("drops emphasis and code markers", () => {
    expect(plainContent("**Ship** the _new_ `widget`")).toBe("Ship the new widget");
  });
});

describe("normalizeTask", () => {
  test("maps a task to an item", () => {
    const item = normalizeTask(
      rawTask({
        priority: 4,
        labels: ["email"],
        due: { date: "2026-09-24", string: "every day", is_recurring: true, lang: "en", timezone: null },
        deadline: { date: "2026-09-30", lang: "en" },
        added_at: "2026-09-20T15:04:05.123456Z",
      }),
      projects,
    );

    expect(item).toEqual({
      id: "todoist:6XGgmFVcrG5RRjVr",
      source: "todoist",
      title: "Buy widgets",
      description: "",
      priority: 1,
      due: { date: "2026-09-24", recurring: true, text: "every day" },
      deadline: "2026-09-30",
      activityAt: null,
      createdAt: "2026-09-20T15:04:05.123456Z",
      context: "Widgets",
      inbox: false,
      tags: ["email"],
      url: "https://app.todoist.com/app/task/6XGgmFVcrG5RRjVr",
      gmail: null,
      github: null,
      todoist: { projectId: "p1" },
    });
  });

  test("turns Todoist's upward priority scale into P1 to P3", () => {
    const priorities = [4, 3, 2, 1, 9].map((priority) => normalizeTask(rawTask({ priority }), projects)?.priority);
    expect(priorities).toEqual([1, 2, 3, null, null]);
  });

  test("leaves the project name empty for a project it does not know", () => {
    expect(normalizeTask(rawTask({ project_id: "unknown" }), projects)?.context).toBeNull();
  });

  test("marks a task in Todoist's Inbox project", () => {
    expect(normalizeTask(rawTask({ project_id: "p0" }), projects)?.inbox).toBe(true);
    expect(normalizeTask(rawTask(), projects)?.inbox).toBe(false);
  });

  test("keeps the deadline of a task with no due date", () => {
    // What a task matched by "overdue" through its deadline alone looks like.
    const item = normalizeTask(rawTask({ due: null, deadline: { date: "2026-09-09", lang: "en" } }), projects);
    expect(item).toMatchObject({ due: null, deadline: "2026-09-09" });
  });

  test("skips completed and deleted tasks", () => {
    expect(normalizeTask(rawTask({ checked: true }), projects)).toBeNull();
    expect(normalizeTask(rawTask({ is_deleted: true }), projects)).toBeNull();
  });
});

describe("normalizeTasks", () => {
  test("drops payloads that are not tasks", () => {
    expect(normalizeTasks([null, "task", { id: 5 }, rawTask()], projects)).toHaveLength(1);
  });
});

describe("projectTree", () => {
  test("puts the Inbox first and each project under its parent, in Todoist's order", () => {
    const tree = projectTree([
      { id: "g", name: "Gadgets", child_order: 2 },
      { id: "w", name: "Widgets", child_order: 1 },
      { id: "l", name: "Launch", parent_id: "w", child_order: 1 },
      { id: "d", name: "Dashboard", parent_id: "g", child_order: 1 },
      { id: "i", name: "Inbox", inbox_project: true, child_order: 0 },
      { id: "old", name: "Old widgets", is_archived: true },
    ]);
    expect(tree).toEqual([
      { id: "i", name: "Inbox", depth: 0, inbox: true },
      { id: "w", name: "Widgets", depth: 0, inbox: false },
      { id: "l", name: "Launch", depth: 1, inbox: false },
      { id: "g", name: "Gadgets", depth: 0, inbox: false },
      { id: "d", name: "Dashboard", depth: 1, inbox: false },
    ]);
  });

  test("shows a project whose parent is archived at the top", () => {
    const tree = projectTree([
      { id: "w", name: "Widgets", is_archived: true },
      { id: "l", name: "Launch", parent_id: "w" },
    ]);
    expect(tree).toEqual([{ id: "l", name: "Launch", depth: 0, inbox: false }]);
  });
});

describe("apiPriority", () => {
  test("counts P1 as Todoist's 4 and no priority as its 1", () => {
    expect([1, 2, 3, 4].map((p) => apiPriority(p as 1 | 2 | 3 | 4))).toEqual([4, 3, 2, 1]);
  });
});
