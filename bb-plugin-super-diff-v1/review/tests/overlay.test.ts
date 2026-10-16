import { describe, expect, it } from "vitest";
import type { Scenario, TestsBlock } from "../grouping";
import { buildOverlay, type TestInputs } from "./overlay";
import type { TestCase } from "./parse";

const FILE = "src/widget.test.ts";

function testCase(index: number, name: string, steps: number): TestCase {
  return {
    index,
    name,
    fullName: name,
    line: index * 10,
    endLine: index * 10 + 5,
    steps: Array.from({ length: steps }, (_, i) => ({
      id: `${index}.${i + 1}`,
      kind: "exact" as const,
      line: index * 10 + i + 1,
      code: `widget(${i}) toBe ${i}`,
      snapshotKey: null,
      helper: null,
    })),
  };
}

const inputs: TestInputs = {
  files: new Map([[FILE, { path: FILE, tests: [testCase(1, "reserves widgets", 4), testCase(2, "refuses a member", 1)] }]]),
  snapshots: new Map(),
};

const scenario = (title: string, ...steps: string[]): Scenario => ({
  title,
  given: ["a widget"],
  when: ["someone reserves it"],
  then: [{ text: "it works", steps: steps.map((s) => `${FILE}:${s}`) }],
});
const block = (...covered: Scenario[]): TestsBlock => ({ covered, notCovered: [], notCoveredNote: "Nothing else." });

describe("buildOverlay: which test() calls each scenario describes", () => {
  it("matches a scenario that cites one whole test no other scenario cites", () => {
    const overlay = buildOverlay(block(scenario("Reserve", "1"), scenario("Refuse", "2.1")), inputs);
    expect(overlay.scenarios.map((s) => s.tests)).toEqual([
      [{ path: FILE, test: 1, name: "reserves widgets", cited: 4, total: 4, sharedWith: 0, line: 10, endLine: 15 }],
      [{ path: FILE, test: 2, name: "refuses a member", cited: 1, total: 1, sharedWith: 0, line: 20, endLine: 25 }],
    ]);
  });

  it("records a test split across scenarios, with how many of its steps each cites", () => {
    const overlay = buildOverlay(block(scenario("First half", "1.1", "1.2"), scenario("Second half", "1.3", "1.4")), inputs);
    expect(overlay.scenarios.map((s) => s.tests)).toEqual([
      [{ path: FILE, test: 1, name: "reserves widgets", cited: 2, total: 4, sharedWith: 1, line: 10, endLine: 15 }],
      [{ path: FILE, test: 1, name: "reserves widgets", cited: 2, total: 4, sharedWith: 1, line: 10, endLine: 15 }],
    ]);
  });

  it("records a scenario that spans two tests", () => {
    const overlay = buildOverlay(block(scenario("Both", "1", "2")), inputs);
    expect(overlay.scenarios[0]!.tests.map((t) => t.test)).toEqual([1, 2]);
  });

  it("leaves out a citation that is no longer in the test", () => {
    const overlay = buildOverlay(block(scenario("Ghost", "9.1")), inputs);
    expect(overlay.scenarios[0]!.tests).toEqual([]);
  });
});
