// A test concern's overlay, from its tests block and the parsed test and
// snapshot files. Pure; service.ts reads the files.
import type { ViewTests } from "../contract";
import type { TestsBlock } from "../grouping";
import { splitRef } from "./check";
import { coveredFeature, notCoveredFeature, type ResolvedStep } from "./feature";
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

export function buildOverlay(title: string, block: TestsBlock, inputs: TestInputs): ViewTests {
  const resolve = resolver(inputs);
  const { text, snapshots } = coveredFeature(title, block.covered, resolve);
  const cited = block.covered.flatMap((s) => s.then.flatMap((t) => t.steps.flatMap((ref) => resolve(ref) ?? [])));
  const unique = new Map(cited.map((s) => [s.id + s.code, s]));
  const steps = [...unique.values()];
  return {
    covered: text,
    notCovered: notCoveredFeature(block.notCovered, block.notCoveredNote),
    scenarios: block.covered.length,
    asserted: steps.filter((s) => s.kind === "exact" || s.kind === "error" || s.kind === "mock").length,
    snapshotOnly: steps.filter((s) => s.kind === "snapshot").length,
    gaps: block.notCovered.length,
    snapshots,
  };
}
