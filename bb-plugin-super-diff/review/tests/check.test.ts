import { describe, expect, it } from "vitest";
import type { Grouping } from "../grouping";
import { addedLines, checkTests, formatTestViolation } from "./check";
import { parseTestFile, type TestFile } from "./parse";

const SOURCE = `test("a manager archives a widget", async () => {
  expect(await archive("sprocket")).toMatchSnapshot();
  expect(list().length).toBe(1);
});

test("a member cannot archive", async () => {
  await expect(archive("gadget")).rejects.toMatchSnapshot();
});

test("an old test nobody touched", () => {
  expect(1).toBe(1);
});
`;
const PATH = "src/archive.test.ts";
const files = new Map<string, TestFile>([[PATH, parseTestFile(PATH, SOURCE)]]);
/** The diff added lines 1 to 8: the first two tests. */
const changed = new Map([[PATH, new Set([1, 2, 3, 4, 5, 6, 7, 8])]]);
const lines = (path: string) => (path === "src/archive.ts" ? 40 : null);

const gap = {
  title: "Archiving a missing widget",
  reason: "untested" as const,
  note: "The NOT_FOUND branch is never reached.",
  evidence: [{ path: "src/archive.ts", line: 23 }],
  given: ["no widget named ghost"],
  when: ["MANAGER archives ghost"],
  then: ["the call is refused"],
};

function grouping(tests: NonNullable<Grouping["concerns"][number]["tests"]> | undefined): Grouping {
  return { headline: "h", concerns: [{ title: "Tests", note: "n", files: [PATH], ...(tests ? { tests } : {}) }] };
}

const COVERED = [
  { title: "A manager archives", given: ["MANAGER"], when: ["MANAGER archives"], then: [{ text: "it comes back archived", steps: [`${PATH}:1.1`, `${PATH}:1.2`] }] },
  { title: "A member cannot", given: [], when: ["MEMBER archives"], then: [{ text: "refused", steps: [`${PATH}:2`] }] },
];

describe("checkTests", () => {
  const concernsWith = new Map([[0, [PATH]]]);

  it("accepts scenarios citing every changed test and snapshot, with a gap list", () => {
    expect(checkTests(grouping({ covered: COVERED, notCovered: [gap] }), concernsWith, files, changed, lines)).toEqual([]);
  });

  it("requires a tests block on a concern holding a test file", () => {
    expect(checkTests(grouping(undefined), concernsWith, files, changed, lines)).toEqual([{ kind: "tests-missing", concern: 0, path: PATH }]);
  });

  it("reports a changed test no scenario cites, and an uncited snapshot step", () => {
    const covered = [COVERED[0]!];
    expect(checkTests(grouping({ covered, notCovered: [gap] }), concernsWith, files, changed, lines)).toEqual([
      { kind: "test-uncited", concern: 0, path: PATH, test: 2, name: "a member cannot archive" },
      { kind: "snapshot-uncited", concern: 0, path: PATH, step: "2.1" },
    ]);
  });

  it("does not ask for tests the diff did not change", () => {
    const result = checkTests(grouping({ covered: COVERED, notCovered: [gap] }), concernsWith, files, changed, lines);
    expect(result.some((v) => v.kind === "test-uncited" && v.test === 3)).toBe(false);
  });

  it("reports unknown steps, missing evidence, and an empty gap list with no reason", () => {
    const covered = [...COVERED, { title: "x", given: [], when: ["w"], then: [{ text: "t", steps: [`${PATH}:9.9`, "src/other.test.ts:1"] }] }];
    const badGap = { ...gap, evidence: [{ path: "src/archive.ts", line: 99 }, { path: "src/nope.ts", line: 1 }] };
    expect(checkTests(grouping({ covered, notCovered: [badGap] }), concernsWith, files, changed, lines)).toEqual([
      { kind: "unknown-step", concern: 0, ref: `${PATH}:9.9` },
      { kind: "unknown-step", concern: 0, ref: "src/other.test.ts:1" },
      { kind: "evidence-missing", concern: 0, path: "src/archive.ts", line: 99 },
      { kind: "evidence-missing", concern: 0, path: "src/nope.ts", line: 1 },
    ]);
    expect(checkTests(grouping({ covered: COVERED, notCovered: [] }), concernsWith, files, changed, lines)).toEqual([{ kind: "not-covered-empty", concern: 0 }]);
    expect(checkTests(grouping({ covered: COVERED, notCovered: [], notCoveredNote: "Every branch is tried." }), concernsWith, files, changed, lines)).toEqual([]);
  });

  it("says what to do", () => {
    const g = grouping(undefined);
    expect(formatTestViolation({ kind: "snapshot-uncited", concern: 0, path: PATH, step: "2.1" }, g)).toBe(
      `snapshot not explained: "Tests" holds ${PATH}:2.1, a snapshot no scenario cites. Cite it from the Then line it backs.`,
    );
  });
});

describe("addedLines", () => {
  it("numbers the new-side lines a hunk adds", () => {
    expect([...addedLines(["@@ -1,3 +1,4 @@\n a\n+b\n c\n+d"])]).toEqual([2, 4]);
    expect([...addedLines(["@@ -10,2 +20,3 @@ ctx\n-x\n+y\n z\n+w"])]).toEqual([20, 22]);
  });
});
