import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { stepsFromTodos } from "./import.js";
import { MIGRATIONS, OverviewStore } from "./store.js";

function makeStore() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  let clock = 1_000;
  let next = 0;
  const store = new OverviewStore(db, {
    now: () => clock,
    newId: () => `id${++next}`,
  });
  return { store, tick: (ms = 1) => (clock += ms) };
}

describe("OverviewStore", () => {
  let store: OverviewStore;
  let tick: (ms?: number) => number;

  beforeEach(() => {
    ({ store, tick } = makeStore());
  });

  it("returns an empty overview for a thread it has never seen", () => {
    expect(store.get("t1")).toEqual({
      threadId: "t1",
      summary: "",
      steps: [],
      updatedAt: 0,
    });
  });

  it("sets the summary and records when it changed", () => {
    expect(store.setSummary("t1", "Add a CSV export.", "agent")).toBe(true);
    expect(store.get("t1")).toMatchObject({ summary: "Add a CSV export.", updatedAt: 1_000 });

    tick();
    store.setSummary("t1", "Add a CSV and a PDF export.", "user");
    expect(store.get("t1").updatedAt).toBe(1_001);
  });

  it("reports an unchanged summary as no change", () => {
    store.setSummary("t1", "Same.", "agent");
    expect(store.setSummary("t1", " Same. ", "agent")).toBe(false);
  });

  it("appends steps in order and reports only what it created", () => {
    store.addSteps("t1", ["One", "Two"], "agent");
    expect(store.addSteps("t1", ["two", "Three"], "agent").map((s) => s.text)).toEqual(["Three"]);
    expect(store.steps("t1").map((s) => [s.text, s.position])).toEqual([
      ["One", 1],
      ["Two", 2],
      ["Three", 3],
    ]);
  });

  it("keeps threads apart", () => {
    store.addSteps("t1", ["One"], "agent");
    store.addSteps("t2", ["Two"], "agent");
    expect(store.steps("t1").map((s) => s.text)).toEqual(["One"]);
  });

  it("keeps one step current", () => {
    store.addSteps("t1", ["One", "Two"], "agent");
    store.setStatus("t1", ["One"], "current", "agent");
    const { changed } = store.setStatus("t1", ["Two"], "current", "agent");
    expect(changed.map((s) => [s.text, s.status])).toEqual([
      ["One", "todo"],
      ["Two", "current"],
    ]);
  });

  it("hands unmatched references back", () => {
    store.addSteps("t1", ["One"], "agent");
    expect(store.setStatus("t1", ["Nope"], "done", "agent")).toEqual({
      changed: [],
      unmatched: ["Nope"],
    });
  });

  it("removes only steps you added", () => {
    const [agent] = store.addSteps("t1", ["Agent step"], "agent");
    const [yours] = store.addSteps("t1", ["Your step"], "user");
    expect(store.removeStep("t1", agent!.id)).toBe(false);
    expect(store.removeStep("t1", yours!.id)).toBe(true);
    expect(store.steps("t1").map((s) => s.text)).toEqual(["Agent step"]);
  });

  it("drops a deleted thread", () => {
    store.setSummary("t1", "x", "agent");
    store.addSteps("t1", ["One"], "agent");
    expect(store.dropThread("t1")).toBe(1);
    expect(store.get("t1").summary).toBe("");
  });

  it("imports Thread Todos rows once, keeping ids and positions", () => {
    const steps = stepsFromTodos([
      { id: "a", threadId: "t1", text: "Open item", status: "open", source: "user", position: 4, createdAt: 10, updatedAt: 20 },
      { id: "b", threadId: "t1", text: "Done item", status: "done", source: "agent", position: 7, createdAt: 10, updatedAt: 30 },
      { id: "c", threadId: "t2", text: "Other", status: "open", source: "agent", position: 1, createdAt: 5, updatedAt: 5 },
    ]);
    expect(store.importSteps(steps)).toEqual({ steps: 3, threads: 2 });
    expect(store.importSteps(steps)).toEqual({ steps: 0, threads: 2 });

    const overview = store.get("t1");
    expect(overview.steps.map((s) => [s.id, s.status, s.source, s.position])).toEqual([
      ["a", "todo", "user", 4],
      ["b", "done", "agent", 7],
    ]);
    expect(overview).toMatchObject({ summary: "", updatedAt: 30 });

    // New steps land after the imported ones.
    store.addSteps("t1", ["New"], "agent");
    expect(store.steps("t1").at(-1)?.position).toBe(8);
  });

  it("puts imported steps after a thread's existing ones", () => {
    store.addSteps("t1", ["Existing"], "agent");
    store.importSteps(
      stepsFromTodos([
        { id: "a", threadId: "t1", text: "Imported", status: "open", source: "agent", position: 1, createdAt: 1, updatedAt: 1 },
      ]),
    );
    expect(store.steps("t1").map((s) => [s.text, s.position])).toEqual([
      ["Existing", 1],
      ["Imported", 2],
    ]);
  });

  it("keeps meta", () => {
    expect(store.meta("k")).toBeNull();
    store.setMeta("k", "v1");
    store.setMeta("k", "v2");
    expect(store.meta("k")).toBe("v2");
  });
});
