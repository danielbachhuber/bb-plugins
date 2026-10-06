// The wire schema shared by the server and the panel. No node imports: the
// frontend bundle imports this file. Both sides validate against it, so a
// field added to the view has to be added here or it never reaches the panel.
import { z } from "zod";

export const REVIEW_CHANGED = "review-changed";

const fileStatus = z.enum(["added", "deleted", "modified", "renamed"]);

export const viewHunkSchema = z.object({
  path: z.string(),
  index: z.number().int(),
  kind: z.enum(["hunk", "file"]),
  header: z.string(),
  text: z.string(),
  status: z.enum(["current", "changed", "removed"]),
});

export const viewFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  fileStatus,
  binary: z.boolean(),
  header: z.string(),
  /** How many items the file has in the diff now, for "hunks 1 and 3 of 4". */
  total: z.number().int(),
  /** Marked viewed at the file's current diff. */
  viewed: z.boolean(),
  hunks: z.array(viewHunkSchema),
});

/** One scenario, as Gherkin with its recorded values folded and in full. */
/** A test() call a scenario cites, and how much of it. */
export const viewScenarioTestSchema = z.object({
  path: z.string(),
  /** The test's number in its file, from 1. */
  test: z.number().int(),
  name: z.string(),
  /** How many of the test's steps this scenario cites. */
  cited: z.number().int(),
  total: z.number().int(),
  /** How many other scenarios in the concern cite this test too. */
  sharedWith: z.number().int(),
});

export const viewScenarioSchema = z.object({
  title: z.string(),
  /** The test() calls it describes, in the order it cites them. */
  tests: z.array(viewScenarioTestSchema),
  asserted: z.number().int(),
  snapshotOnly: z.number().int(),
  /** Each recorded value folded to a note on its step. */
  steps: z.string(),
  /** Each recorded value in full, as a docstring under its step. */
  values: z.string(),
});

/** A test concern's Scenarios view, built from the agent's scenarios and the parsed tests. */
export const viewTestsSchema = z.object({
  scenarios: z.array(viewScenarioSchema),
  notCovered: z.string(),
  asserted: z.number().int(),
  snapshotOnly: z.number().int(),
  gaps: z.number().int(),
  /** Recorded snapshot values the scenarios show in full. */
  snapshots: z.number().int(),
});

export const viewSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  files: z.array(viewFileSchema),
  tests: viewTestsSchema.nullable(),
});

export const staleSchema = z.object({
  groupedAt: z.string(),
  groupedHead: z.string(),
  /** null when the grouped HEAD is no longer an ancestor: the branch was rewritten. */
  commitsSince: z.number().int().nullable(),
  /** Each changed file's diff from the snapshot to now: bare `@@` hunks, or "" for binary. */
  changedFiles: z.array(z.object({ path: z.string(), patch: z.string() })),
});

export const reviewViewSchema = z.object({
  headline: z.string().nullable(),
  concerns: z.array(viewSectionSchema),
  notYetGrouped: viewSectionSchema.nullable(),
  mechanical: viewSectionSchema.nullable(),
  stale: staleSchema.nullable(),
  coverage: z.object({
    files: z.number().int(),
    hunks: z.number().int(),
    shown: z.number().int(),
    viewed: z.number().int(),
    /** The ref the branch is compared against, such as origin/main. */
    base: z.string().optional(),
  }),
});

export const reviewResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("ok"), view: reviewViewSchema }),
  z.object({ state: z.literal("unavailable"), message: z.string() }),
]);

export type ViewHunk = z.infer<typeof viewHunkSchema>;
export type ViewFile = z.infer<typeof viewFileSchema>;
export type ViewSection = z.infer<typeof viewSectionSchema>;
export type ViewTests = z.infer<typeof viewTestsSchema>;
export type ViewScenario = z.infer<typeof viewScenarioSchema>;
export type ViewScenarioTest = z.infer<typeof viewScenarioTestSchema>;
export type StaleInfo = z.infer<typeof staleSchema>;
export type ReviewView = z.infer<typeof reviewViewSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const rpcShape = {
  review_get: {
    input: z.object({ threadId: z.string().min(1) }),
    output: reviewResultSchema,
  },
  review_set_viewed: {
    input: z.object({ threadId: z.string().min(1), path: z.string().min(1), viewed: z.boolean() }),
    output: z.object({ ok: z.literal(true) }),
  },
  review_generate: {
    input: z.object({ threadId: z.string().min(1) }),
    output: z.object({ sent: z.literal(true) }),
  },
};

/** A one-file patch holding just this hunk, for bb's diff viewer. */
export function hunkPatch(file: ViewFile, hunk: ViewHunk): string {
  return `${file.header}\n${hunk.text}\n`;
}
