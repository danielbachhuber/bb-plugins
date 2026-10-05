import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getView, hunks, submit, verifyData, type Checkout } from "./service";
import { createStore, MIGRATIONS } from "./store";
import { makeRepo } from "./testing/repo";

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((c) => c());
  cleanups = [];
});

async function setup() {
  const r = await makeRepo();
  cleanups.push(r.cleanup);
  r.run("checkout", "-q", "-b", "feature");
  r.write("src/widget.ts", "export const widget = 2;\n");
  r.write("src/gadget.ts", "export const gadget = 1;\n");
  r.run("add", ".");
  r.run("commit", "-qm", "Widget and gadget");
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  const checkout: Checkout = { root: r.root, mergeBaseBranch: "main" };
  return { r, store: createStore(db), checkout };
}

const GOOD = {
  headline: "The widget counts to two, and a gadget joins it.",
  concerns: [
    { title: "Widget", note: "Bumps the widget.", files: ["src/widget.ts"] },
    { title: "Gadget", note: "Adds the gadget.", files: ["src/gadget.ts"] },
  ],
};
const NOW = new Date("2026-10-05T12:00:00.000Z");

describe("service", () => {
  it("lists hunks numbered from 0", async () => {
    const { checkout } = await setup();
    expect(await hunks(checkout, false)).toContain("A  src/gadget.ts  (1 hunk)");
  });

  it("rejects a grouping that leaves a hunk out, and stores nothing", async () => {
    const { store, checkout } = await setup();
    const result = await submit(store, "thr_1", checkout, { ...GOOD, concerns: [GOOD.concerns[0]] }, NOW);
    expect(result).toEqual({ ok: false, text: expect.stringContaining("missing: src/gadget.ts#0") });
    expect(store.get("thr_1")).toBeNull();
  });

  it("rejects malformed JSON shapes with the field that is wrong", async () => {
    const { store, checkout } = await setup();
    const result = await submit(store, "thr_1", checkout, { concerns: [] }, NOW);
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/headline/);
  });

  it("accepts a complete grouping, then shows it current", async () => {
    const { store, checkout } = await setup();
    expect(await submit(store, "thr_1", checkout, GOOD, NOW)).toEqual({ ok: true, text: "Accepted: 2 concerns, 2 hunks across 2 files." });
    const view = await getView(store, "thr_1", checkout);
    expect(view.concerns.map((c) => c.title)).toEqual(["Widget", "Gadget"]);
    expect(view.stale).toBeNull();
    expect((await verifyData(store, "thr_1", checkout)).text).toBe("2 files, 2 hunks: 2 shown once, 0 missing, 0 twice.");
  });

  it("a commit that changes no content stays current", async () => {
    const { r, store, checkout } = await setup();
    r.write("src/widget.ts", "export const widget = 3;\n");
    await submit(store, "thr_1", checkout, GOOD, NOW);
    r.run("commit", "-qam", "Commit the reviewed edit");
    expect((await getView(store, "thr_1", checkout)).stale).toBeNull();
  });

  it("goes stale after an edit, and shows exactly what changed", async () => {
    const { r, store, checkout } = await setup();
    await submit(store, "thr_1", checkout, GOOD, NOW);
    r.write("src/gadget.ts", "export const gadget = 9;\n");
    r.run("commit", "-qam", "Gadget nine");
    r.write("src/sprocket.ts", "export const sprocket = 1;\n");

    const view = await getView(store, "thr_1", checkout);
    expect(view.stale!.commitsSince).toBe(1);
    expect(view.stale!.changedFiles.map((f) => f.path)).toEqual(["src/gadget.ts", "src/sprocket.ts"]);
    expect(view.stale!.changedFiles[0]!.patch).toBe("@@ -1 +1 @@\n-export const gadget = 1;\n+export const gadget = 9;\n");
    expect(view.concerns[1]!.files[0]!.hunks[0]!.status).toBe("changed");
    expect(view.notYetGrouped!.files.map((f) => f.path)).toEqual(["src/sprocket.ts"]);
    expect((await verifyData(store, "thr_1", checkout)).ok).toBe(true);
  });

  it("groups a submodule and reads it back without throwing", async () => {
    const { r, store, checkout } = await setup();
    const sub = await makeRepo();
    cleanups.push(sub.cleanup);
    r.run("-c", "protocol.file.allow=always", "submodule", "add", "-q", sub.root, "vendor/sub");
    r.run("commit", "-qm", "Add a submodule");
    const files = ["src/widget.ts", "src/gadget.ts", ".gitmodules", "vendor/sub"];
    const grouping = { headline: "Adds a submodule.", concerns: [{ title: "All", note: "Everything.", files }] };
    expect((await submit(store, "thr_1", checkout, grouping, NOW)).ok).toBe(true);
    expect((await getView(store, "thr_1", checkout)).stale).toBeNull();
    expect((await verifyData(store, "thr_1", checkout)).ok).toBe(true);
  });

  it("verify fails when there is no grouping yet, and still lists the items", async () => {
    const { store, checkout } = await setup();
    const result = await verifyData(store, "thr_1", checkout);
    expect(result.ok).toBe(false);
    expect(result.text).toMatch(/^No grouping yet/);
    expect(result.items.sort()).toEqual(["src/gadget.ts#0", "src/widget.ts#0"]);
  });
});
