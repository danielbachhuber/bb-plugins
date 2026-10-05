// A test concern's overlay, from its tests block and the parsed test and
// snapshot files. Pure; service.ts reads the files.
import type { ViewTests } from "../contract";
import type { TestsBlock } from "../grouping";
import { splitRef } from "./check";
import { notCoveredFeature, scenarioFeature, type ResolvedStep } from "./feature";
import type { TestFile } from "./parse";

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

export function buildOverlay(block: TestsBlock, inputs: TestInputs): ViewTests {
  const resolve = resolver(inputs);
  const scenarios = block.covered.map((scenario) => {
    const folded = scenarioFeature(scenario, resolve, { values: false });
    const full = scenarioFeature(scenario, resolve, { values: true });
    return { title: scenario.title, asserted: folded.asserted, snapshotOnly: folded.snapshotOnly, steps: folded.text, values: full.text, snapshots: full.snapshots };
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
