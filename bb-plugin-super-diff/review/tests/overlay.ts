// A test concern's overlay, from its tests block and the parsed test and
// snapshot files. Pure; service.ts reads the files.
import type { ViewScenarioTest, ViewTests } from "../contract";
import type { Scenario, TestsBlock } from "../grouping";
import { splitRef } from "./check";
import { notCoveredFeature, scenarioFeature, type ResolvedStep } from "./feature";
import type { TestCase, TestFile } from "./parse";

export interface TestInputs {
  files: Map<string, TestFile>;
  /** Each test file's snapshot entries, by test file path. */
  snapshots: Map<string, Map<string, string>>;
}

export function resolver(inputs: TestInputs) {
  return (ref: string): ResolvedStep[] | null => {
    const { path, test, step } = splitRef(ref);
    const found = inputs.files.get(path)?.tests.find((t) => t.index === test);
    if (!found) return null;
    const steps = step === null ? found.steps : found.steps[step - 1] ? [found.steps[step - 1]!] : null;
    if (steps === null) return null;
    const entries = inputs.snapshots.get(path);
    return steps.map((s) => ({ id: s.id, kind: s.kind, code: s.code, value: s.snapshotKey ? (entries?.get(s.snapshotKey) ?? null) : null }));
  };
}

/** Each test() call a scenario cites, keyed `path:test`, with the step ids it cites. */
function citedTests(scenario: Scenario, inputs: TestInputs): Map<string, { path: string; test: TestCase; steps: Set<string> }> {
  const resolve = resolver(inputs);
  const out = new Map<string, { path: string; test: TestCase; steps: Set<string> }>();
  for (const ref of scenario.then.flatMap((then) => then.steps)) {
    const { path, test } = splitRef(ref);
    const found = inputs.files.get(path)?.tests.find((t) => t.index === test);
    const steps = resolve(ref);
    if (!found || steps === null) continue;
    const key = `${path}:${test}`;
    const entry = out.get(key) ?? { path, test: found, steps: new Set<string>() };
    for (const step of steps) entry.steps.add(step.id);
    out.set(key, entry);
  }
  return out;
}

/**
 * Which test() calls each scenario describes. The agent writes scenarios by
 * behaviour, so one may describe part of a test or several tests; this is
 * what lets the panel say when the descriptions do not line up with the code.
 */
function scenarioTests(covered: Scenario[], inputs: TestInputs): ViewScenarioTest[][] {
  const cited = covered.map((scenario) => citedTests(scenario, inputs));
  const citers = new Map<string, number>();
  for (const tests of cited) for (const key of tests.keys()) citers.set(key, (citers.get(key) ?? 0) + 1);
  return cited.map((tests) =>
    [...tests.entries()].map(([key, { path, test, steps }]) => ({
      path,
      test: test.index,
      name: test.name,
      cited: steps.size,
      total: test.steps.length,
      sharedWith: citers.get(key)! - 1,
    })),
  );
}

export function buildOverlay(block: TestsBlock, inputs: TestInputs): ViewTests {
  const resolve = resolver(inputs);
  const tests = scenarioTests(block.covered, inputs);
  const scenarios = block.covered.map((scenario, i) => {
    const folded = scenarioFeature(scenario, resolve, { values: false });
    const full = scenarioFeature(scenario, resolve, { values: true });
    return { title: scenario.title, tests: tests[i]!, asserted: folded.asserted, snapshotOnly: folded.snapshotOnly, steps: folded.text, values: full.text, snapshots: full.snapshots };
  });
  // Counted once per step across the concern, since scenarios can cite the same step.
  const cited = new Map(block.covered.flatMap((s) => s.then.flatMap((t) => t.steps.flatMap((ref) => resolve(ref) ?? []))).map((s) => [s.id + s.code, s]));
  const steps = [...cited.values()];
  return {
    scenarios: scenarios.map(({ snapshots: _, ...scenario }) => scenario),
    notCovered: notCoveredFeature(block.notCovered, block.notCoveredNote),
    asserted: steps.filter((s) => s.kind === "exact" || s.kind === "error" || s.kind === "mock" || s.kind === "helper").length,
    snapshotOnly: steps.filter((s) => s.kind === "snapshot").length,
    gaps: block.notCovered.length,
    snapshots: scenarios.reduce((n, s) => n + s.snapshots, 0),
  };
}
