import { describe, expect, it, vi } from "vitest";
import { createShelfStore } from "./shelf-store";
import { fixtureList } from "./fixtures";

describe("shelf store", () => {
  it("shares one load between the page and the Refresh button", async () => {
    const store = createShelfStore();
    const fetchList = vi.fn(async () => fixtureList());
    await Promise.all([store.load(fetchList, true), store.load(fetchList, true)]);
    expect(fetchList).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().list?.rows).toHaveLength(5);
  });

  it("keeps the last list when a reload fails", async () => {
    const store = createShelfStore();
    await store.load(async () => fixtureList(), false);
    await store.load(async () => {
      throw new Error("server restarted");
    }, true);
    expect(store.getSnapshot().list).not.toBeNull();
    expect(store.getSnapshot().error).toBe("server restarted");
  });

  it("tells subscribers about each change", async () => {
    const store = createShelfStore();
    const listener = vi.fn();
    store.subscribe(listener);
    await store.load(async () => fixtureList(), false);
    expect(listener).toHaveBeenCalledTimes(2); // loading, then loaded
  });
});
