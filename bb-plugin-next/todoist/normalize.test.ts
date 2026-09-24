import { describe, expect, test } from "vitest";

import { normalizeTask, normalizeTasks, plainContent, projectNameMap } from "./normalize.js";

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

const projects = projectNameMap([
  { id: "p1", name: "Widgets" },
  { id: "p2", name: "Gadgets" },
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
      }),
      projects,
    );

    expect(item).toEqual({
      id: "todoist:6XGgmFVcrG5RRjVr",
      source: "todoist",
      title: "Buy widgets",
      description: "",
      priority: 1,
      due: { date: "2026-09-24", recurring: true },
      deadline: "2026-09-30",
      activityAt: null,
      context: "Widgets",
      tags: ["email"],
      url: "https://app.todoist.com/app/task/6XGgmFVcrG5RRjVr",
    });
  });

  test("turns Todoist's upward priority scale into P1 to P3", () => {
    const priorities = [4, 3, 2, 1, 9].map((priority) => normalizeTask(rawTask({ priority }), projects)?.priority);
    expect(priorities).toEqual([1, 2, 3, null, null]);
  });

  test("leaves the project name empty for a project it does not know", () => {
    expect(normalizeTask(rawTask({ project_id: "unknown" }), projects)?.context).toBeNull();
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
