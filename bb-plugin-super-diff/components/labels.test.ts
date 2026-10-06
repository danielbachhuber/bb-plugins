import { describe, expect, it } from "vitest";
import { coverageLabel, fileStats, hunkNote, scenarioMismatch, sourcePath, staleLabel, testsMismatch, testsTag, viewedLabel } from "./labels";

const file = (indexes: number[], total: number) => ({
  path: "a.ts",
  previousPath: null,
  fileStatus: "modified" as const,
  binary: false,
  header: "",
  total,
  viewed: false,
  hunks: indexes.map((index) => ({ path: "a.ts", index, kind: "hunk" as const, header: "", text: "", status: "current" as const })),
});

describe("labels", () => {
  it("names the hunks of a split file, counting from 1", () => {
    expect(hunkNote(file([0, 2], 4))).toBe("hunks 1 and 3 of 4");
    expect(hunkNote(file([0, 1, 3], 4))).toBe("hunks 1, 2, and 4 of 4");
    expect(hunkNote(file([1], 2))).toBe("hunk 2 of 2");
    expect(hunkNote(file([0, 1], 2))).toBeNull();
  });

  it("says how far the branch has moved", () => {
    expect(staleLabel(2, 3)).toBe("2 commits and 3 files changed since");
    expect(staleLabel(0, 1)).toBe("1 file changed since");
    expect(staleLabel(null, 2)).toBe("the branch was rewritten, and 2 files changed since");
  });

  it("counts what is shown", () => {
    expect(coverageLabel({ files: 41, hunks: 118, shown: 118, viewed: 0 })).toBe("41 files, 118 hunks, all shown");
    expect(coverageLabel({ files: 1, hunks: 1, shown: 1, viewed: 0 })).toBe("1 file, 1 hunk, all shown");
    expect(coverageLabel({ files: 41, hunks: 118, shown: 117, viewed: 0 })).toBe("41 files, 117 of 118 hunks shown");
    expect(coverageLabel({ files: 3, hunks: 4, shown: 4, viewed: 0, base: "origin/main" })).toBe("3 files, 4 hunks, all shown, against origin/main");
  });

  it("counts the lines a file adds and removes", () => {
    const f = { ...file([0], 1), hunks: [{ path: "a.ts", index: 0, kind: "hunk" as const, header: "", text: "@@ -1,2 +1,2 @@\n-a\n+b\n+c\n d", status: "current" as const }] };
    expect(fileStats(f)).toEqual({ added: 2, removed: 1 });
  });

  it("says how many files are viewed", () => {
    expect(viewedLabel({ files: 12, hunks: 30, shown: 30, viewed: 5 })).toBe("5 of 12 files viewed");
    expect(viewedLabel({ files: 1, hunks: 1, shown: 1, viewed: 1 })).toBe("1 of 1 file viewed");
  });

  it("gives different text a different source path, so bb's viewer never reuses stale lines", () => {
    const a = sourcePath("concern-0/scenario-1", "Scenario: one\n  Given a");
    expect(a).toMatch(/^concern-0\/scenario-1-[0-9a-f]+\.feature$/);
    expect(sourcePath("concern-0/scenario-1", "Scenario: one\n  Given a")).toBe(a);
    expect(sourcePath("concern-0/scenario-1", "Scenario: one\n  Given b\n  When c")).not.toBe(a);
  });

  it("tags a concern's tests in the rail by what else it holds", () => {
    const tests = { scenarios: [{ title: "a", tests: [], asserted: 1, snapshotOnly: 0, steps: "", values: "" }], notCovered: "", asserted: 1, snapshotOnly: 0, gaps: 0, snapshots: 0 };
    const section = (paths: string[], withTests = true) => ({
      id: "concern-0",
      title: "",
      note: "",
      files: paths.map((path) => ({ ...file([0], 1), path })),
      tests: withTests ? tests : null,
    });
    expect(testsTag(section(["src/a.ts"], false))).toBeNull();
    expect(testsTag(section(["src/a.test.ts", "src/__snapshots__/a.test.ts.snap.firebase"]))).toBe("tests");
    expect(testsTag(section(["src/a.ts", "src/a.test.ts"]))).toBe("1 scenario");
  });

  describe("scenarios against test() calls", () => {
    const test = (n: number, cited: number, total: number, sharedWith = 0) => ({ path: "src/a.test.ts", test: n, name: `test ${n}`, cited, total, sharedWith });
    const scenario = (...tests: ReturnType<typeof test>[]) => ({ title: "s", tests, asserted: 0, snapshotOnly: 0, steps: "", values: "" });
    const block = (...scenarios: ReturnType<typeof scenario>[]) => ({ scenarios, notCovered: "", asserted: 0, snapshotOnly: 0, gaps: 0, snapshots: 0 });

    it("says nothing when each scenario is one whole test of its own", () => {
      expect(scenarioMismatch(scenario(test(1, 4, 4)))).toBeNull();
      expect(testsMismatch(block(scenario(test(1, 4, 4)), scenario(test(2, 1, 1))))).toBeNull();
    });

    it("names part of a test, several tests, and a shared test", () => {
      expect(scenarioMismatch(scenario(test(1, 22, 46, 2)))).toBe("22 of 46 steps of one test");
      expect(scenarioMismatch(scenario(test(1, 1, 1), test(2, 1, 1)))).toBe("spans 2 tests");
      expect(scenarioMismatch(scenario(test(1, 4, 4, 1)))).toBe("shares its test with 1 other scenario");
    });

    it("says how many tests the scenarios describe, naming a single one", () => {
      expect(testsMismatch(block(scenario(test(1, 22, 46, 2)), scenario(test(1, 22, 46, 2)), scenario(test(1, 2, 46, 2))))).toBe(
        '3 scenarios describe 1 test() call, "test 1", so the descriptions do not match the tests one to one.',
      );
      expect(testsMismatch(block(scenario(test(1, 1, 1), test(2, 1, 1))))).toBe(
        "1 scenario describes 2 test() calls, so the descriptions do not match the tests one to one.",
      );
    });
  });
});
