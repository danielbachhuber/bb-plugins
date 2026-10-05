// What the agent submits. The headline and every concern's title and note are
// the judgment; which hunks exist is the plugin's to know.
import { z } from "zod";

export const fileRefSchema = z.union([
  z.string().min(1),
  z.object({ path: z.string().min(1), hunks: z.array(z.number().int().min(0)).min(1) }),
]);

const line = z.string().trim().min(1).max(300);

/** `<test file>:<test>` for a whole test, or `<test file>:<test>.<step>` for one assertion. */
export const stepRefSchema = z.string().regex(/^.+:\d+(\.\d+)?$/, "a step is <test file>:<test> or <test file>:<test>.<step>");

export const scenarioSchema = z.object({
  title: line,
  given: z.array(line),
  when: z.array(line).min(1),
  then: z.array(z.object({ text: line, steps: z.array(stepRefSchema).min(1) })).min(1),
});

export const GAP_REASONS = ["untested", "unchecked", "never-run", "outside-layer"] as const;

export const gapSchema = z.object({
  title: line,
  reason: z.enum(GAP_REASONS),
  note: z.string().trim().min(1).max(500),
  evidence: z.array(z.object({ path: z.string().min(1), line: z.number().int().min(1) })).min(1),
  given: z.array(line),
  when: z.array(line).min(1),
  then: z.array(line).min(1),
});

/** For a concern holding tests: what they cover as scenarios, and what they leave out. */
export const testsSchema = z.object({
  covered: z.array(scenarioSchema).min(1),
  notCovered: z.array(gapSchema),
  /** Why nothing is missing, when notCovered is empty. */
  notCoveredNote: z.string().trim().min(1).max(500).optional(),
});

export const concernSchema = z.object({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(2000),
  files: z.array(fileRefSchema).min(1),
  tests: testsSchema.optional(),
});

export const groupingSchema = z.object({
  headline: z.string().trim().min(1).max(300),
  concerns: z.array(concernSchema).min(1),
});

export type Grouping = z.infer<typeof groupingSchema>;
export type TestsBlock = z.infer<typeof testsSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Gap = z.infer<typeof gapSchema>;
