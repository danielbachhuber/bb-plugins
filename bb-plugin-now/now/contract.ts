import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

import { itemSchema, todoistProjectSchema } from "./types.js";

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
  /** Null until the first sync finishes. */
  list: nowListSchema.nullable(),
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
  /** Your open Todoist projects, for the edit strip's project picker. Asks Todoist each time. */
  todoist_projects: {
    input: z.null(),
    output: z.object({ projects: z.array(todoistProjectSchema), error: z.string().nullable() }),
  },
  /**
   * Save a Todoist row's edit strip: the date in words, the priority, and the
   * project, sent together. The row takes what Todoist saved, and a sync
   * follows, since the new date or project can move it or take it off the page.
   */
  items_edit: {
    input: z.object({
      id: z.string(),
      /** Todoist caps a task's name at 500 characters. */
      content: z.string().max(500),
      due: z.string().max(200),
      /** Already a day: Todoist does not read a deadline's words, so the page does. */
      deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      projectId: z.string().nullable(),
    }),
    output: z.object({ saved: z.boolean(), error: z.string().nullable() }),
  },
  /**
   * Move a recurring Todoist task's current occurrence to a later day, keeping
   * its rule and its time of day. A sync follows, as after an edit.
   */
  items_postpone: {
    input: z.object({ id: z.string(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    output: z.object({ postponed: z.boolean(), error: z.string().nullable() }),
  },
  /** Delete a Todoist row's task for good, and take the row off the page. There is no undo. */
  items_delete: {
    input: z.object({ id: z.string() }),
    output: z.object({ deleted: z.boolean(), error: z.string().nullable() }),
  },
  /** Mark a Gmail row's threads read, leaving them in the inbox and the row on the page. */
  items_mark_read: {
    input: z.object({ id: z.string() }),
    output: z.object({ marked: z.boolean(), error: z.string().nullable() }),
  },
  /**
   * Reverse a recent archive, completion, or mark read: the threads go back in
   * the inbox or back to unread, or the task reopens, and the row returns as it
   * was. Only for what this server did since it last started.
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
