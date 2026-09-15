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
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Longest comment body accepted. Generous for prose, bounded for storage. */
export const MAX_BODY = 10_000;

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
} as const;

/** Realtime channel the panel and the overlay refetch on. */
export const COMMENTS_CHANGED = "comments-changed";
