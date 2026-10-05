import { describe, expect, it } from "vitest";
import { isTestFile, parseSnapshotFile, parseTestFile, snapshotPathFor } from "./parse";

const SOURCE = `import { expect, test } from "vitest";
import { apiAs, MANAGER, MEMBER } from "../test-support";

describe("archiving", () => {
  test("a manager archives a widget", async () => {
    const manager = apiAs(MANAGER);
    expect(await manager.widgets.archive({ widgetKey: "sprocket" })).toMatchSnapshot();
    const list = await apiAs(MEMBER).widgets.list();
    expect(list.items.map((w) => w.widgetKey)).toEqual(["gadget"]);
    expect(list).toMatchSnapshot();
    await expect(apiAs(MEMBER).widgets.archive({ widgetKey: "gadget" })).rejects.toMatchSnapshot();
    await expect(apiAs(MEMBER).widgets.delete({ widgetKey: "gadget" })).rejects.toThrow("FORBIDDEN");
    expect(list.nextCursor).toBeNull();
    expect(mailer.send).not.toHaveBeenCalled();
  });
});

it("lists nothing when empty", () => {
  expect([]).toHaveLength(0);
});
`;

describe("parseTestFile", () => {
  const file = parseTestFile("src/widgets/archive.test.ts", SOURCE);

  it("finds each test with its describe prefix, in order", () => {
    expect(file.tests.map((t) => [t.index, t.fullName, t.line])).toEqual([
      [1, "archiving a manager archives a widget", 5],
      [2, "lists nothing when empty", 18],
    ]);
  });

  it("numbers each expect as a step and labels its kind", () => {
    expect(file.tests[0]!.steps.map((s) => [s.id, s.kind, s.line])).toEqual([
      ["1.1", "snapshot", 7],
      ["1.2", "exact", 9],
      ["1.3", "snapshot", 10],
      ["1.4", "snapshot", 11],
      ["1.5", "error", 12],
      ["1.6", "truthy", 13],
      ["1.7", "mock", 14],
    ]);
  });

  it("writes a step's code on one line", () => {
    expect(file.tests[0]!.steps[1]!.code).toBe('list.items.map((w) => w.widgetKey) toEqual ["gadget"]');
    expect(file.tests[0]!.steps[3]!.code).toBe('apiAs(MEMBER).widgets.archive({ widgetKey: "gadget" }) rejects toMatchSnapshot');
    expect(file.tests[0]!.steps[6]!.code).toBe("mailer.send not toHaveBeenCalled");
  });

  it("pairs each snapshot step with its entry, by full test name and counter", () => {
    expect(file.tests[0]!.steps.filter((s) => s.snapshotKey).map((s) => s.snapshotKey)).toEqual([
      "archiving a manager archives a widget 1",
      "archiving a manager archives a widget 2",
      "archiving a manager archives a widget 3",
    ]);
  });

  it("returns no tests for a file it cannot find any in", () => {
    expect(parseTestFile("src/a.test.ts", "export const a = 1;").tests).toEqual([]);
  });
});

describe("snapshot files", () => {
  it("reads entries, unescaping backticks and template markers", () => {
    const snap = [
      "// Vitest Snapshot v1",
      "",
      "exports[`archiving a manager archives a widget 1`] = `",
      "{",
      '  "name": "Sprocket \\`large\\`",',
      '  "price": "\\${4}",',
      "}",
      "`;",
      "",
      "exports[`archiving a manager archives a widget 3`] = `[Error: Only a manager can archive a widget]`;",
      "",
    ].join("\n");
    const entries = parseSnapshotFile(snap);
    expect([...entries.keys()]).toEqual(["archiving a manager archives a widget 1", "archiving a manager archives a widget 3"]);
    expect(entries.get("archiving a manager archives a widget 1")).toBe('{\n  "name": "Sprocket `large`",\n  "price": "${4}",\n}');
    expect(entries.get("archiving a manager archives a widget 3")).toBe("[Error: Only a manager can archive a widget]");
  });

  it("knows test files and where their snapshots live", () => {
    expect(isTestFile("src/a.test.ts")).toBe(true);
    expect(isTestFile("src/a.spec.tsx")).toBe(true);
    expect(isTestFile("src/__tests__/a.ts")).toBe(true);
    expect(isTestFile("src/a.ts")).toBe(false);
    expect(snapshotPathFor("src/widgets/archive.test.ts")).toBe("src/widgets/__snapshots__/archive.test.ts.snap");
  });
});
