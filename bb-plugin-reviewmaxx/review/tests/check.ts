// Checking a concern's test scenarios against the tests themselves. Pure:
// the caller passes the parsed test files, the lines the diff added, and a
// way to count a file's lines for evidence.
import type { Grouping } from "../grouping";
import type { TestFile } from "./parse";

export type TestViolation =
  | { kind: "tests-missing"; concern: number; path: string }
  | { kind: "unknown-step"; concern: number; ref: string }
  | { kind: "test-uncited"; concern: number; path: string; test: number; name: string }
  | { kind: "snapshot-uncited"; concern: number; path: string; step: string }
  | { kind: "evidence-missing"; concern: number; path: string; line: number }
  | { kind: "not-covered-empty"; concern: number };

/** The new-side line numbers a set of hunks adds. */
export function addedLines(hunks: string[]): Set<number> {
  const added = new Set<number>();
  for (const hunk of hunks) {
    const lines = hunk.split("\n");
    let at = Number(/^@@ -\d+(?:,\d+)? \+(\d+)/.exec(lines[0] ?? "")?.[1] ?? 0);
    for (const line of lines.slice(1)) {
      if (line.startsWith("+")) added.add(at++);
      else if (line.startsWith(" ")) at++;
    }
  }
  return added;
}

/** Split `path:1.3` into the file and the id, from the right, since paths can hold colons. */
export function splitRef(ref: string): { path: string; test: number; step: number | null } {
  const at = ref.lastIndexOf(":");
  const [test, step] = ref.slice(at + 1).split(".");
  return { path: ref.slice(0, at), test: Number(test), step: step === undefined ? null : Number(step) };
}

/**
 * @param concernTests each concern's test files, by concern index: the test files whose hunks it holds
 * @param changed the new-side lines the diff adds, per test file; a test counts as changed when one falls inside it
 * @param lineCount a file's line count in the checkout, or null when it does not exist
 */
export function checkTests(
  grouping: Grouping,
  concernTests: Map<number, string[]>,
  files: Map<string, TestFile>,
  changed: Map<string, Set<number>>,
  lineCount: (path: string) => number | null,
): TestViolation[] {
  const violations: TestViolation[] = [];
  for (const [ci, paths] of [...concernTests.entries()].sort((a, b) => a[0] - b[0])) {
    const block = grouping.concerns[ci]?.tests;
    if (block === undefined) {
      for (const path of paths) violations.push({ kind: "tests-missing", concern: ci, path });
      continue;
    }

    const citedTests = new Set<string>();
    const citedSteps = new Set<string>();
    for (const scenario of block.covered) {
      for (const then of scenario.then) {
        for (const ref of then.steps) {
          const { path, test, step } = splitRef(ref);
          const file = files.get(path);
          const found = file?.tests.find((t) => t.index === test);
          if (!found || (step !== null && !found.steps[step - 1])) {
            violations.push({ kind: "unknown-step", concern: ci, ref });
            continue;
          }
          citedTests.add(`${path}:${test}`);
          if (step === null) found.steps.forEach((s) => citedSteps.add(`${path}:${s.id}`));
          else citedSteps.add(`${path}:${found.steps[step - 1]!.id}`);
        }
      }
    }

    for (const path of paths) {
      const added = changed.get(path) ?? new Set<number>();
      for (const test of files.get(path)?.tests ?? []) {
        const touched = [...added].some((line) => line >= test.line && line <= test.endLine);
        if (!touched) continue;
        if (!citedTests.has(`${path}:${test.index}`)) {
          violations.push({ kind: "test-uncited", concern: ci, path, test: test.index, name: test.name });
        }
        for (const step of test.steps) {
          if (step.snapshotKey !== null && !citedSteps.has(`${path}:${step.id}`)) {
            violations.push({ kind: "snapshot-uncited", concern: ci, path, step: step.id });
          }
        }
      }
    }

    for (const gap of block.notCovered) {
      for (const evidence of gap.evidence) {
        const count = lineCount(evidence.path);
        if (count === null || evidence.line > count) violations.push({ kind: "evidence-missing", concern: ci, path: evidence.path, line: evidence.line });
      }
    }
    if (block.notCovered.length === 0 && !block.notCoveredNote) violations.push({ kind: "not-covered-empty", concern: ci });
  }
  return violations;
}

export function formatTestViolation(violation: TestViolation, grouping: Grouping): string {
  const title = `"${grouping.concerns[violation.concern]?.title ?? `concern ${violation.concern}`}"`;
  switch (violation.kind) {
    case "tests-missing":
      return `tests missing: ${title} holds ${violation.path} but has no tests block. Add its covered and notCovered scenarios.`;
    case "unknown-step":
      return `unknown step: ${title} cites ${violation.ref}, which is not a test or step. Run \`bb reviewmaxx tests\` for the ids.`;
    case "test-uncited":
      return `test not described: ${title} holds ${violation.path}:${violation.test} ("${violation.name}"), which no scenario cites.`;
    case "snapshot-uncited":
      return `snapshot not explained: ${title} holds ${violation.path}:${violation.step}, a snapshot no scenario cites. Cite it from the Then line it backs.`;
    case "evidence-missing":
      return `evidence not found: ${title} points at ${violation.path}:${violation.line}, which is not a line in the checkout.`;
    case "not-covered-empty":
      return `not covered is empty: ${title} lists nothing the tests leave out. List the gaps, or say why there are none in notCoveredNote.`;
  }
}
