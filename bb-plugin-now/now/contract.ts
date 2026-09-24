import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { itemSchema } from "./types.js";

/** How one source's fetch went. Its items, if any, are in the merged list. */
export const sourceStatusSchema = z.discriminatedUnion("state", [
  z.object({
    id: z.string(),
    name: z.string(),
    state: z.literal("unconfigured"),
    /** What to run or set to configure it. */
    hint: z.string(),
  }),
  z.object({
    id: z.string(),
    name: z.string(),
    state: z.literal("ok"),
    /** What the source was asked for, such as a Todoist filter. */
    query: z.string().nullable(),
    count: z.number().int(),
  }),
  z.object({
    id: z.string(),
    name: z.string(),
    state: z.literal("error"),
    query: z.string().nullable(),
    message: z.string(),
    /** How many of its items from the last good sync are still in the list. */
    kept: z.number().int(),
  }),
]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const nowListSchema = z.object({
  items: z.array(itemSchema),
  sources: z.array(sourceStatusSchema),
  /** When this sync finished. ISO 8601. */
  fetchedAt: z.string(),
});
export type NowList = z.infer<typeof nowListSchema>;

/** The stored list, and whether a sync is running now. */
export const listingSchema = z.object({
  /** Null until the first sync finishes. Snoozed items are not in it. */
  list: nowListSchema.nullable(),
  /** What a snooze is hiding, and until when. */
  snoozed: z.array(z.object({ item: itemSchema, until: z.string() })),
  /** Item id to the thread started from it. */
  threads: z.record(z.string(), z.string()),
  /** The project a new thread starts in unless the composer picks another. */
  threadProjectId: z.string().nullable(),
  syncing: z.boolean(),
});
export type Listing = z.infer<typeof listingSchema>;

/**
 * What bb's new-thread composer hands back, checked only as far as the plugin
 * relies on it: a project and some input. Everything else passes to
 * `threads.spawn` unchanged, where bb validates it.
 */
const newThreadRequestSchema = z.looseObject({
  projectId: z.string().min(1),
  input: z.array(z.looseObject({ type: z.string() })).min(1),
});

export const rpcContract = defineRpcContract({
  /** The stored list. Reads the database only; never calls a source. */
  items_list: {
    input: z.null(),
    output: listingSchema,
  },
  /**
   * Sync now, or join the sync already running. `ifOlderThanMs` skips the sync
   * when the stored list is newer than that, which is how the page refreshes
   * on open without syncing twice when it is opened twice.
   */
  items_sync: {
    input: z.object({ ifOlderThanMs: z.number().int().nonnegative().optional() }).nullable(),
    output: z.object({ synced: z.boolean(), error: z.string().nullable() }),
  },
  /** Hide an item until `until`. Newer activity on it brings it back sooner. */
  items_snooze: {
    input: z.object({ id: z.string(), until: z.string().datetime({ offset: true }) }),
    output: z.object({ until: z.string() }),
  },
  items_unsnooze: {
    input: z.object({ id: z.string() }),
    output: z.object({ unsnoozed: z.boolean() }),
  },
  /** Take a Gmail row's threads out of the inbox, and the row off the page. */
  items_archive: {
    input: z.object({ id: z.string() }),
    output: z.object({ archived: z.boolean(), error: z.string().nullable() }),
  },
  /** Complete a Todoist row's task, and take the row off the page. */
  items_complete: {
    input: z.object({ id: z.string() }),
    output: z.object({
      completed: z.boolean(),
      /**
       * False for a recurring task: completing moves it to its next date, and
       * reopening does not move it back, so there is nothing to undo to.
       */
      undoable: z.boolean(),
      error: z.string().nullable(),
    }),
  },
  /**
   * Reverse a recent archive or completion: the threads go back in the inbox,
   * or the task reopens, and the row returns. Only for what this server did
   * since it last started.
   */
  items_undo: {
    input: z.object({ id: z.string() }),
    output: z.object({ restored: z.boolean(), error: z.string().nullable() }),
  },
  /**
   * Start a thread about a row, from what bb's composer resolved, or return the
   * one already started from it.
   */
  items_start_thread: {
    input: z.object({ id: z.string(), request: newThreadRequestSchema }),
    output: z.object({ threadId: z.string().nullable(), existing: z.boolean(), error: z.string().nullable() }),
  },
  /**
   * Reply to a calendar invitation's event as you: yes, no, or maybe. The row
   * keeps its place and shows the reply.
   */
  items_rsvp: {
    input: z.object({ id: z.string(), response: z.enum(["accepted", "declined", "tentative"]) }),
    output: z.object({
      response: z.enum(["accepted", "declined", "tentative", "needsAction"]).nullable(),
      error: z.string().nullable(),
    }),
  },
  /** Merge a GitHub row's pull request, as you. */
  items_merge: {
    input: z.object({ id: z.string(), method: z.enum(["merge", "squash", "rebase"]) }),
    output: z.object({ merged: z.boolean(), error: z.string().nullable() }),
  },
  /** Comment on a GitHub row's pull request or issue, as you. */
  items_reply: {
    input: z.object({ id: z.string(), body: z.string().trim().min(1).max(65_000) }),
    output: z.object({ url: z.string().nullable(), error: z.string().nullable() }),
  },
});

/** Published after a sync starts or finishes; the page re-reads the listing. */
export const SYNC_CHANNEL = "now-synced";
