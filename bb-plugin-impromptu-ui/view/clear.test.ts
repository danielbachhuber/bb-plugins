import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { planClear } from "./clear.js";
import { parseView } from "./schema.js";
import { MIGRATIONS, createStore } from "./store.js";

const AT = "2026-11-01T00:00:00.000Z";
const message = (label: string) => ({ type: "message", label, text: label });

function setup(view: object) {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  const store = createStore(db);
  const stored = store.publish("thr_a", "default", parseView(JSON.stringify(view)), null, AT);
  return { store, id: stored.id };
}

describe("planClear", () => {
  const cards = {
    title: "Findings",
    sections: [
      { title: "Bugs", items: [{ id: "a", title: "A", actions: [message("Fix")] }, { id: "b", title: "B", actions: [message("Fix")] }] },
      { title: "Style", items: [{ id: "c", title: "C", actions: [message("Fix")] }] },
    ],
  };

  it("takes out done and dismissed cards and drops a section left empty", () => {
    const { store, id } = setup(cards);
    store.setItem(id, "a", { state: "done", result: null }, AT);
    store.setItem(id, "c", { state: "dismissed", result: null }, AT);
    const plan = planClear(store.get(id)!);
    expect(plan.kind).toBe("prune");
    if (plan.kind !== "prune") return;
    expect(plan.resolved.map((item) => item.id)).toEqual(["a", "c"]);
    expect(plan.open).toBe(1);
    expect(plan.view.sections.map((section) => section.items.map((item) => item.id))).toEqual([["b"]]);
  });

  it("hides the view once every card is resolved", () => {
    const { store, id } = setup(cards);
    for (const item of ["a", "b", "c"]) store.setItem(id, item, { state: "done", result: null }, AT);
    expect(planClear(store.get(id)!)).toMatchObject({ kind: "hide" });
  });

  it("keeps a view with nothing resolved", () => {
    const { store, id } = setup(cards);
    expect(planClear(store.get(id)!)).toEqual({ kind: "keep", reason: "nothing-resolved" });
  });

  it("counts an item whose status is complete as resolved, and one in progress as open", () => {
    const { store, id } = setup({
      title: "Rounds",
      sections: [
        {
          items: [
            { id: "s1", title: "S1", status: { label: "Added", tone: "success", complete: true }, actions: [message("Revise")] },
            { id: "s2", title: "S2", status: { label: "In progress", tone: "warning" }, actions: [message("Revise")] },
          ],
        },
      ],
    });
    const plan = planClear(store.get(id)!);
    expect(plan).toMatchObject({ kind: "prune", open: 1 });
  });

  it("leaves the cards in place while the closing step that tallies them is open", () => {
    const { store, id } = setup({
      title: "Review",
      sections: [
        {
          items: [
            { id: "f1", title: "F1", actions: [message("Fix")] },
            { id: "f2", title: "F2", actions: [message("Fix")] },
            { id: "verdict", title: "Verdict", closing: true, actions: [message("Approve"), message("Request changes")] },
          ],
        },
      ],
    });
    store.setItem(id, "f1", { state: "done", result: null }, AT);
    expect(planClear(store.get(id)!)).toEqual({ kind: "keep", reason: "closing-open" });
  });

  it("keeps a list view's plain rows and hides it once no decision is left", () => {
    const { store, id } = setup({
      title: "Groceries",
      layout: "list",
      sections: [{ items: [{ id: "milk", title: "Milk" }, { id: "eggs", title: "Eggs", actions: [message("Add")] }] }],
    });
    store.setItem(id, "eggs", { state: "done", result: null }, AT);
    expect(planClear(store.get(id)!)).toMatchObject({ kind: "hide" });
  });

  it("takes cleared items off the page map", () => {
    const { store, id } = setup({
      title: "Pages",
      sections: [{ items: ["p", "q"].map((item) => ({ id: item, title: item, meter: { value: 1, max: 2 }, actions: [message("Fix")] })) }],
      map: { pages: [{ label: "Page 1", columns: [["p"], ["q"]] }] },
    });
    store.setItem(id, "p", { state: "done", result: null }, AT);
    const plan = planClear(store.get(id)!);
    expect(plan.kind === "prune" && plan.view.map?.pages[0]?.columns).toEqual([["q"]]);
  });
});

describe("store.replaceView", () => {
  it("keeps the view's id, its publish time, and what the user did to the cards it still has", () => {
    const { store, id } = setup({ title: "T", sections: [{ items: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }] });
    store.setItem(id, "b", { state: "done", result: null }, AT);
    const next = store.replaceView(id, parseView(JSON.stringify({ title: "T", sections: [{ items: [{ id: "b", title: "B" }] }] })));
    expect(next?.id).toBe(id);
    expect(next?.publishedAt).toBe(AT);
    expect(next?.items.b?.state).toBe("done");
    expect(next?.view.sections[0]?.items.map((item) => item.id)).toEqual(["b"]);
  });
});
