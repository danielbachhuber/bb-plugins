import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { getView, hunks, setViewed, submit, testsText, verifyData, type Checkout } from "./service";
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
    expect(await hunks(checkout, false)).toMatch(/^2 files, 2 items against main\./);
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
    expect(view.coverage.base).toBe("main");
    expect((await verifyData(store, "thr_1", checkout)).text).toBe("2 files, 2 hunks: 2 shown once, 0 missing, 0 twice.");
  });

  it("marks the hunks a card shows viewed, until their lines change, and clears them", async () => {
    const { r, store, checkout } = await setup();
    await submit(store, "thr_1", checkout, GOOD, NOW);
    await setViewed(store, "thr_1", checkout, "src/widget.ts", [0], true);
    const widget = async () => (await getView(store, "thr_1", checkout)).concerns[0]!.files[0]!;
    expect((await widget()).viewed).toBe(true);
    r.write("src/widget.ts", "export const widget = 4;\n");
    expect((await widget()).viewed).toBe(false);
    await setViewed(store, "thr_1", checkout, "src/widget.ts", [0], true);
    await setViewed(store, "thr_1", checkout, "src/widget.ts", [0], false);
    expect((await widget()).viewed).toBe(false);
  });

  it("checks its file list against bb's, asked for the same base", async () => {
    const { store, checkout } = await setup();
    const asked: string[] = [];
    const agree = await getView(store, "thr_1", checkout, async (base) => (asked.push(base), ["src/gadget.ts", "src/widget.ts"]));
    expect(asked).toEqual(["main"]);
    expect(agree.crossCheck).toEqual({ status: "agree", onlyBb: [], onlyHere: [], reason: null });
    const differ = await getView(store, "thr_1", checkout, async () => ["src/widget.ts", "docs/export.md"]);
    expect(differ.crossCheck).toMatchObject({ status: "differ", onlyBb: ["docs/export.md"], onlyHere: ["src/gadget.ts"] });
    expect((await getView(store, "thr_1", checkout)).crossCheck).toBeNull();
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

  describe("tests", () => {
    const TEST = `import { expect, test } from "vitest";
import { gadget } from "./gadget";

test("the gadget is one", () => {
  expect(gadget).toMatchSnapshot();
  expect(gadget).toBe(1);
});
`;
    const SNAP = "// Vitest Snapshot v1\n\nexports[`the gadget is one 1`] = `1`;\n";

    async function withTest() {
      const ctx = await setup();
      ctx.r.write("src/gadget.test.ts", TEST);
      ctx.r.write("src/__snapshots__/gadget.test.ts.snap", SNAP);
      return ctx;
    }

    const block = {
      covered: [{ title: "The gadget", given: [], when: ["the gadget is read"], then: [{ text: "it is one", steps: ["src/gadget.test.ts:1"] }] }],
      notCovered: [],
      notCoveredNote: "The gadget is a constant.",
    };
    const grouping = (tests?: typeof block) => ({
      headline: "A gadget, and a test for it.",
      concerns: [
        { title: "Widget", note: "Bumps the widget.", files: ["src/widget.ts", "src/gadget.ts"] },
        { title: "Tests", note: "Pins the gadget.", files: ["src/gadget.test.ts"], ...(tests ? { tests } : {}) },
      ],
    });

    it("lists each test's numbered steps for the agent", async () => {
      const { checkout } = await withTest();
      const text = await testsText(checkout);
      expect(text).toContain("src/gadget.test.ts:1  the gadget is one");
      expect(text).toContain("1.1  snapshot only  gadget toMatchSnapshot");
    });

    it("rejects a test concern without scenarios, and accepts one with them", async () => {
      const { store, checkout } = await withTest();
      const rejected = await submit(store, "thr_1", checkout, grouping(), NOW);
      expect(rejected.ok).toBe(false);
      expect(rejected.text).toContain("tests missing");
      expect((await submit(store, "thr_1", checkout, grouping(block), NOW)).ok).toBe(true);
    });

    it("shows the overlay with each recorded value under its step", async () => {
      const { store, checkout } = await withTest();
      await submit(store, "thr_1", checkout, grouping(block), NOW);
      const tests = (await getView(store, "thr_1", checkout)).concerns[1]!.tests!;
      expect(tests.scenarios.map((sc) => [sc.title, sc.asserted, sc.snapshotOnly])).toEqual([["The gadget", 1, 1]]);
      expect(tests.scenarios[0]!.steps).toContain("    # 1.1 gadget toMatchSnapshot  (recorded: 1 line)");
      expect(tests.scenarios[0]!.values).toContain('  Then it is one  # snapshot only, asserted\n    # 1.1 gadget toMatchSnapshot\n    """\n    1\n    """');
      expect(tests.snapshots).toBe(1);
      expect(tests.notCovered).toContain("# The gadget is a constant.");
    });

    it("counts helpers the agent names, and rejects one no test calls", async () => {
      const { r, store, checkout } = await setup();
      r.write("src/gadget.test.ts", 'import { test } from "vitest";\nimport { checkOne } from "./support";\n\ntest("the gadget is one", () => {\n  checkOne(gadget);\n});\n');
      expect(await testsText(checkout, ["checkOne"])).toContain("1.1  asserted  checkOne(gadget)");
      expect(await testsText(checkout)).not.toContain("checkOne(gadget)");

      const scenario = { title: "The gadget", given: [], when: ["the gadget is read"], then: [{ text: "it is one", steps: ["src/gadget.test.ts:1.1"] }] };
      const grouping = (helpers: string[]) => ({
        headline: "A gadget, and a test for it.",
        assertionHelpers: helpers,
        concerns: [
          { title: "Widget", note: "Bumps the widget.", files: ["src/widget.ts", "src/gadget.ts"] },
          { title: "Tests", note: "Pins the gadget.", files: ["src/gadget.test.ts"], tests: { covered: [scenario], notCovered: [], notCoveredNote: "A constant." } },
        ],
      });
      const unused = await submit(store, "thr_1", checkout, grouping(["checkOne", "checkTwo"]), NOW);
      expect(unused.ok).toBe(false);
      expect(unused.text).toContain("helper not called: checkTwo");
      expect((await submit(store, "thr_1", checkout, grouping(["checkOne"]), NOW)).ok).toBe(true);
      const tests = (await getView(store, "thr_1", checkout)).concerns[1]!.tests!;
      expect(tests.scenarios[0]!.steps).toContain("# 1.1 checkOne(gadget)");
      expect(tests.asserted).toBe(1);
    });
  });
});
