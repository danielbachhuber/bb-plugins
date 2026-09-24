import { describe, expect, test, vi } from "vitest";

import { loadSources, unconfiguredSource, type Source } from "./sources.js";
import type { Item } from "./types.js";

const now = new Date("2026-09-24T09:30:00Z");

function item(id: string, date: string): Item {
  return {
    id,
    source: "fake",
    title: id,
    description: "",
    priority: null,
    due: { date, recurring: false },
    context: null,
    tags: [],
    url: `https://example.com/${id}`,
  };
}

function loadedSource(id: string, items: Item[]): Source {
  return {
    id,
    name: id,
    query: null,
    load: async () => ({ status: { id, name: id, state: "ok", query: null, count: items.length }, items }),
  };
}

describe("loadSources", () => {
  test("merges every source's items into one ordered list", async () => {
    const list = await loadSources(
      [loadedSource("a", [item("a-later", "2026-09-30")]), loadedSource("b", [item("b-sooner", "2026-09-24")])],
      now,
    );

    expect(list.items.map((merged) => merged.id)).toEqual(["b-sooner", "a-later"]);
    expect(list.sources.map((source) => source.state)).toEqual(["ok", "ok"]);
    expect(list.fetchedAt).toBe("2026-09-24T09:30:00.000Z");
  });

  test("keeps the other sources' items when one fails", async () => {
    const onError = vi.fn();
    const failing: Source = {
      id: "broken",
      name: "Broken",
      query: "everything",
      load: async () => {
        throw new Error("offline");
      },
    };

    const list = await loadSources([failing, loadedSource("a", [item("a1", "2026-09-24")])], now, onError);

    expect(list.items.map((merged) => merged.id)).toEqual(["a1"]);
    expect(list.sources[0]).toEqual({
      id: "broken",
      name: "Broken",
      state: "error",
      query: "everything",
      message: "offline",
    });
    expect(onError).toHaveBeenCalledWith(failing, "offline");
  });

  test("reports an unconfigured source with its hint", async () => {
    const list = await loadSources([unconfiguredSource("todoist", "Todoist", "Set a token.")], now);

    expect(list).toEqual({
      items: [],
      sources: [{ id: "todoist", name: "Todoist", state: "unconfigured", hint: "Set a token." }],
      fetchedAt: "2026-09-24T09:30:00.000Z",
    });
  });
});
