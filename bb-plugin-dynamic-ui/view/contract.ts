import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { viewSchema } from "./schema.js";

const resultSchema = z.object({
  label: z.string(),
  at: z.string(),
  threadId: z.string().optional(),
  exitCode: z.number().int().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
});

const storedViewSchema = z.object({
  id: z.number().int(),
  threadId: z.string(),
  key: z.string(),
  view: viewSchema,
  cwd: z.string().nullable(),
  publishedAt: z.string(),
  items: z.record(
    z.string(),
    z.object({ state: z.enum(["open", "done", "dismissed"]), result: resultSchema.nullable() }),
  ),
});

const itemRefSchema = z.object({
  viewId: z.number().int().positive(),
  itemId: z.string().min(1).max(80),
});

export const rpcContract = defineRpcContract({
  /** The views a thread has published, newest first. The header button needs only the count. */
  thread_views: {
    input: z.object({ threadId: z.string().min(1) }),
    output: z.object({ views: z.array(storedViewSchema) }),
  },
  view_get: {
    input: z.object({ viewId: z.number().int().positive() }),
    output: storedViewSchema.nullable(),
  },
  /** Runs one of an item's actions, by its index in the item's `actions`. */
  action_run: {
    input: itemRefSchema.extend({ index: z.number().int().min(0).max(5) }),
    output: storedViewSchema,
  },
  item_dismiss: {
    input: itemRefSchema.extend({ dismissed: z.boolean() }),
    output: storedViewSchema,
  },
});
