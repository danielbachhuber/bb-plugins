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
  hunks: z.array(viewHunkSchema),
});

export const viewSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  files: z.array(viewFileSchema),
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
  coverage: z.object({ files: z.number().int(), hunks: z.number().int(), shown: z.number().int() }),
});

export const reviewResultSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("ok"), view: reviewViewSchema }),
  z.object({ state: z.literal("unavailable"), message: z.string() }),
]);

export type ViewHunk = z.infer<typeof viewHunkSchema>;
export type ViewFile = z.infer<typeof viewFileSchema>;
export type ViewSection = z.infer<typeof viewSectionSchema>;
export type StaleInfo = z.infer<typeof staleSchema>;
export type ReviewView = z.infer<typeof reviewViewSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const rpcShape = {
  review_get: {
    input: z.object({ threadId: z.string().min(1) }),
    output: reviewResultSchema,
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
