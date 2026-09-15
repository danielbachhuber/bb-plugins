import { describe, expect, it } from "vitest";
import type { AutomationSummary } from "./automations";
import {
  readSnapshot,
  sameAutomations,
  writeSnapshot,
  SNAPSHOT_KEY,
  type SnapshotStore,
} from "./snapshot";

const widgetSweep: AutomationSummary = {
  id: "auto_widgetsweep",
  projectId: "proj_acme",
  name: "Widget sweep",
  projectName: "Acme Widgets",
  enabled: true,
};

function memoryStore(initial: Record<string, string> = {}): SnapshotStore {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** A storage-blocked tab: both calls throw rather than returning null. */
const throwingStore: SnapshotStore = {
  getItem() {
    throw new Error("storage is not available");
  },
  setItem() {
    throw new Error("storage is not available");
  },
};

describe("readSnapshot", () => {
  it("round-trips what was written", () => {
    const store = memoryStore();
    writeSnapshot(store, [widgetSweep]);
    expect(readSnapshot(store)).toEqual([widgetSweep]);
  });

  it("has no rows before anything was written", () => {
    expect(readSnapshot(memoryStore())).toEqual([]);
  });

  it("reads a corrupted entry as no rows", () => {
    expect(readSnapshot(memoryStore({ [SNAPSHOT_KEY]: "{not json" }))).toEqual([]);
  });

  it("re-validates the persisted entries rather than trusting them", () => {
    const store = memoryStore({
      [SNAPSHOT_KEY]: JSON.stringify([{ id: "auto_a", name: "No project of its own" }]),
    });
    expect(readSnapshot(store)).toEqual([]);
  });

  it("survives a store that throws, and a surface with no store at all", () => {
    expect(readSnapshot(throwingStore)).toEqual([]);
    expect(readSnapshot(undefined)).toEqual([]);
  });
});

describe("writeSnapshot", () => {
  it("does not throw when storage refuses the write", () => {
    expect(() => writeSnapshot(throwingStore, [widgetSweep])).not.toThrow();
    expect(() => writeSnapshot(undefined, [widgetSweep])).not.toThrow();
  });
});

describe("sameAutomations", () => {
  it("is true for the same list", () => {
    expect(sameAutomations([widgetSweep], [{ ...widgetSweep }])).toBe(true);
  });

  it("notices a rename, a pause, and a new automation", () => {
    expect(sameAutomations([widgetSweep], [{ ...widgetSweep, name: "Widget sweep v2" }])).toBe(
      false,
    );
    expect(sameAutomations([widgetSweep], [{ ...widgetSweep, enabled: false }])).toBe(false);
    expect(
      sameAutomations([widgetSweep], [{ ...widgetSweep, projectName: "Acme Gadgets" }]),
    ).toBe(false);
    expect(
      sameAutomations([widgetSweep], [widgetSweep, { ...widgetSweep, id: "auto_b" }]),
    ).toBe(false);
  });
});
