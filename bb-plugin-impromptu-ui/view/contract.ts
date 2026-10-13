import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { viewSchema } from "./schema.js";

const resultSchema = z.object({
  label: z.string(),
  at: z.string(),
  threadId: z.string().optional(),
  sentTo: z.string().optional(),
  exitCode: z.number().int().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  edited: z.boolean().optional(),
  draft: z.string().optional(),
  note: z.string().optional(),
  feedback: z
    .object({ pick: z.number().int().nullable(), notes: z.array(z.string()), overall: z.string() })
    .optional(),
});

const storedViewSchema = z.object({
  id: z.number().int(),
  threadId: z.string(),
  key: z.string(),
  view: viewSchema,
  cwd: z.string().nullable(),
  publishedAt: z.string(),
  hiddenAt: z.string().nullable(),
  items: z.record(
    z.string(),
    z.object({
      state: z.enum(["open", "done", "dismissed"]),
      result: resultSchema.nullable(),
      related: z.record(z.string(), resultSchema).optional(),
    }),
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
    input: itemRefSchema.extend({
      index: z.number().int().min(0).max(5),
      /** The item's draft as the user left it; goes where the button's text says `{draft}`. */
      draft: z.string().trim().min(1).max(50_000).optional(),
      /** The push-back note as typed; goes where the button's text says `{note}`. */
      note: z.string().trim().max(5_000).optional(),
    }),
    output: storedViewSchema,
  },
  /** Runs a related entry's button, by the entry's id. */
  related_run: {
    input: itemRefSchema.extend({ entryId: z.string().min(1).max(80) }),
    output: storedViewSchema,
  },
  /** Sends a visual review's pick and notes to the thread as one message. */
  review_submit: {
    input: itemRefSchema.extend({
      pick: z.number().int().min(0).max(5).nullable(),
      notes: z.array(z.string().max(5_000)).max(6),
      overall: z.string().max(10_000),
    }),
    output: storedViewSchema,
  },
  /** One of a visual review's images, as a data URL. */
  image_get: {
    input: itemRefSchema.extend({ index: z.number().int().min(0).max(5) }),
    output: z.object({ dataUrl: z.string().nullable() }),
  },
  /** The other threads a view's buttons send to, by id, with each one's title and whether it is archived. A thread that no longer exists is left out. */
  view_threads: {
    input: z.object({ viewId: z.number().int().positive() }),
    output: z.object({ threads: z.record(z.string(), z.object({ title: z.string(), archived: z.boolean() })) }),
  },
  /** Hides a view from above the composer, or shows it again. */
  /** `threadId` is where it is hidden from, when that is a thread the view's items show in rather than the one that published it. */
  view_hide: {
    input: z.object({ viewId: z.number().int().positive(), hidden: z.boolean(), threadId: z.string().optional() }),
    output: storedViewSchema,
  },
  item_dismiss: {
    input: itemRefSchema.extend({ dismissed: z.boolean() }),
    output: storedViewSchema,
  },
  /** What the new-thread composer starts with for an item: the publishing thread's project and the item as a prompt. */
  item_thread_seed: {
    input: itemRefSchema,
    output: z.object({ projectId: z.string(), providerId: z.string().nullable(), prompt: z.string() }),
  },
  /** Starts a thread from what the composer resolved, titled for the item. Leaves the item as it was. */
  item_thread_start: {
    input: itemRefSchema.extend({
      // The composer's NewThreadRequest, passed to threads.spawn unchanged.
      request: z.looseObject({ projectId: z.string() }),
    }),
    output: z.object({ threadId: z.string() }),
  },
});
