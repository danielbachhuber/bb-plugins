// The wire schema, shared by the server and the frontend.
//
// Both the RPC boundary and the panel validate against these, which is what
// keeps a field added to the record from silently vanishing on its way to the
// UI — the failure mode is an empty panel and an "output validation failed"
// line in the server log, so the schema is part of changing a comment's shape.
import { z } from "zod";

export const sideSchema = z.enum(["old", "new"]);
export const stateSchema = z.enum(["open", "addressed", "resolved"]);

export const anchorSchema = z.object({
  text: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});

export const commentSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  path: z.string(),
  side: sideSchema,
  line: z.number().int(),
  anchor: anchorSchema,
  body: z.string(),
  state: stateSchema,
  reply: z.string().nullable(),
  seq: z.number().int(),
  github: z.object({ url: z.string() }).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const githubCommentSchema = z.object({
  id: z.string(),
  url: z.string(),
  author: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
  pending: z.boolean(),
});

export const githubThreadSchema = z.object({
  id: z.string(),
  path: z.string(),
  side: sideSchema,
  line: z.number().int().nullable(),
  anchor: anchorSchema.nullable(),
  resolved: z.boolean(),
  outdated: z.boolean(),
  comments: z.array(githubCommentSchema),
});

/** The thread's pull request and its review threads, or null for none. */
export const githubReviewSchema = z
  .object({
    number: z.number().int(),
    url: z.string(),
    threads: z.array(githubThreadSchema),
  })
  .nullable();

/** Longest comment body accepted. Generous for prose, bounded for storage. */
export const MAX_BODY = 10_000;

/** A line on a thread's diff, as the composer knows it. */
const locationSchema = z.object({
  threadId: z.string().min(1),
  path: z.string().min(1),
  side: sideSchema,
  line: z.number().int().positive(),
  anchor: anchorSchema,
});

export const githubTargetSchema = z.discriminatedUnion("state", [
  /** GitHub is turned off in settings: no button at all. */
  z.object({ state: z.literal("off") }),
  z.object({ state: z.literal("blocked"), reason: z.string() }),
  z.object({ state: z.literal("ready"), number: z.number().int() }),
]);

export const rpcShape = {
  comments_list: {
    input: z.object({ threadId: z.string().min(1) }),
    output: z.object({ comments: z.array(commentSchema) }),
  },
  comments_add: {
    input: z.object({
      threadId: z.string().min(1),
      path: z.string().min(1),
      side: sideSchema,
      line: z.number().int().positive(),
      anchor: anchorSchema,
      body: z.string().trim().min(1).max(MAX_BODY),
    }),
    output: commentSchema,
  },
  comments_edit: {
    input: z.object({
      threadId: z.string().min(1),
      id: z.string().min(1),
      body: z.string().trim().min(1).max(MAX_BODY),
    }),
    output: commentSchema,
  },
  comments_set_state: {
    input: z.object({
      threadId: z.string().min(1),
      id: z.string().min(1),
      state: stateSchema,
    }),
    output: commentSchema,
  },
  comments_remove: {
    input: z.object({ threadId: z.string().min(1), id: z.string().min(1) }),
    output: z.object({ removed: z.boolean() }),
  },
  github_review: {
    input: z.object({ threadId: z.string().min(1) }),
    output: z.object({ review: githubReviewSchema }),
  },
  /** Whether a line can take a draft review comment, and if not, why. */
  github_target: {
    input: locationSchema,
    output: githubTargetSchema,
  },
  /** Add a draft comment to the viewer's pending review. */
  github_post: {
    input: locationSchema.extend({ body: z.string().trim().min(1).max(MAX_BODY) }),
    output: z.object({ url: z.string() }),
  },
  /** Post a comment, and the agent's answer if any, as one draft, then resolve it. */
  comments_post_to_github: {
    input: z.object({ threadId: z.string().min(1), id: z.string().min(1) }),
    output: commentSchema,
  },
} as const;

/** Realtime channel the panel and the overlay refetch on. */
export const COMMENTS_CHANGED = "comments-changed";
