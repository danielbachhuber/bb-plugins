import { describe, expect, it } from "vitest";
import { orderForDisplay, renderForAgent } from "./list.js";
import type { Todo } from "./types.js";

function todo(overrides: Partial<Todo> & { id: string; text: string }): Todo {
  return {
    threadId: "t1",
    status: "open",
    source: "agent",
    position: 1,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("orderForDisplay", () => {
  it("puts open items first, each group in position order", () => {
    const todos = [
      todo({ id: "a", text: "one", position: 1, status: "done" }),
      todo({ id: "b", text: "two", position: 2 }),
      todo({ id: "c", text: "three", position: 3 }),
    ];
    expect(orderForDisplay(todos).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });
});

describe("renderForAgent", () => {
  it("hands back ids so the next call can reference them", () => {
    const rendered = renderForAgent([
      todo({ id: "a1", text: "Fix the parser" }),
      todo({ id: "b2", text: "Ship it", position: 2, status: "done" }),
    ]);
    expect(rendered).toContain("[ ] a1  Fix the parser");
    expect(rendered).toContain("[x] b2  Ship it");
    expect(rendered).toContain("1 open of 2.");
  });

  it("says so when the list is empty", () => {
    expect(renderForAgent([])).toBe("The todo list is empty.");
  });
});
