// The Scenarios view as Gherkin text, built from the agent's scenarios and the
// parsed steps. Pure. The agent writes only the scenario wording; every step,
// label, and recorded value comes from the test and snapshot files.
import type { Gap, Scenario } from "../grouping";
import type { StepKind } from "./parse";

export interface ResolvedStep {
  id: string;
  kind: StepKind;
  code: string;
  /** The recorded snapshot value, for a snapshot step. */
  value: string | null;
}

export const LABEL: Record<StepKind, string> = {
  exact: "asserted",
  error: "asserted",
  mock: "asserted",
  snapshot: "snapshot only",
  truthy: "checked to exist",
};

/** Given, Given, When becomes Given, And, When, as a .feature file writes it. */
function keyed(keyword: string, lines: string[]): Array<[string, string]> {
  return lines.map((line, i) => [i === 0 ? keyword : "And", line]);
}

/** A docstring cannot hold `"""`, so a value that does gets it escaped. */
const docstring = (value: string, indent: string) => [
  `${indent}"""`,
  ...value.replaceAll('"""', '\\"\\"\\"').split("\n").map((line) => `${indent}${line}`),
  `${indent}"""`,
];

/**
 * @param resolve the steps a reference stands for: one for `path:1.3`, every
 *   step of the test for `path:1`, or null when it is not in the test any more
 * @returns the text and how many recorded values it holds
 */
export function coveredFeature(
  title: string,
  scenarios: Scenario[],
  resolve: (ref: string) => ResolvedStep[] | null,
): { text: string; snapshots: number } {
  const out = [`Feature: ${title}`];
  let snapshots = 0;
  for (const scenario of scenarios) {
    out.push("", `  Scenario: ${scenario.title}`);
    for (const [keyword, line] of [...keyed("Given", scenario.given), ...keyed("When", scenario.when)]) out.push(`    ${keyword} ${line}`);
    scenario.then.forEach((then, i) => {
      const resolved = then.steps.map((ref) => ({ ref, steps: resolve(ref) }));
      const labels = [...new Set(resolved.flatMap((r) => (r.steps ?? []).map((s) => LABEL[s.kind])))];
      out.push(`    ${i === 0 ? "Then" : "And"} ${then.text}${labels.length ? `  # ${labels.join(", ")}` : ""}`);
      for (const { ref, steps } of resolved) {
        if (steps === null) {
          out.push(`      # ${ref} is no longer in the test`);
          continue;
        }
        for (const step of steps) {
          out.push(`      # ${step.id} ${step.code}`);
          if (step.value !== null) {
            out.push(...docstring(step.value, "      "));
            snapshots++;
          }
        }
      }
    });
  }
  return { text: out.join("\n"), snapshots };
}

export function notCoveredFeature(gaps: Gap[], note: string | undefined): string {
  const out = ["Feature: Not covered by these tests"];
  if (gaps.length === 0) {
    out.push("", `  # ${note ?? "Nothing is listed."}`);
    return out.join("\n");
  }
  for (const gap of gaps) {
    out.push("", `  @${gap.reason}`, `  Scenario: ${gap.title}`, `    # ${gap.note}`);
    for (const evidence of gap.evidence) out.push(`    # ${evidence.path}:${evidence.line}`);
    for (const [keyword, line] of [...keyed("Given", gap.given), ...keyed("When", gap.when), ...keyed("Then", gap.then)]) out.push(`    ${keyword} ${line}`);
  }
  return out.join("\n");
}
