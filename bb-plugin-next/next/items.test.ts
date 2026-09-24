import { describe, expect, test } from "vitest";

import { mergeItems } from "./items.js";
import type { Item } from "./types.js";

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    source: "todoist",
    title: id,
    description: "",
    priority: null,
    due: null,
    context: null,
    tags: [],
    url: `https://example.com/${id}`,
    ...overrides,
  };
}

describe("mergeItems", () => {
  test("orders by due date, then priority, with undated items last", () => {
    const order = mergeItems([
      [
        item("undated", { priority: 1 }),
        item("later", { due: { date: "2026-09-30", recurring: false } }),
        item("today-none", { due: { date: "2026-09-24", recurring: false } }),
      ],
      [
        item("today-p1", { priority: 1, due: { date: "2026-09-24", recurring: false } }),
        item("overdue", { due: { date: "2026-09-20", recurring: false } }),
      ],
    ]).map((merged) => merged.id);

    expect(order).toEqual(["overdue", "today-p1", "today-none", "later", "undated"]);
  });
});
