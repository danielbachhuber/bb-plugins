import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collapsedChoice, rememberCollapsed } from "./collapse.js";

describe("collapse choices", () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => items.set(key, value) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps a folded view folded for the same publish", () => {
    rememberCollapsed(7, "7@a", true);
    expect(collapsedChoice(7, "7@a")).toBe(true);
    expect(collapsedChoice(8, "8@a")).toBeUndefined();
  });

  it("forgets the choice once the view is published again", () => {
    rememberCollapsed(7, "7@a", true);
    expect(collapsedChoice(7, "7@b")).toBeUndefined();
  });

  it("keeps only the newest 200 choices", () => {
    for (let id = 0; id < 205; id++) rememberCollapsed(id, `${id}@a`, true);
    expect(collapsedChoice(0, "0@a")).toBeUndefined();
    expect(collapsedChoice(204, "204@a")).toBe(true);
  });
});
