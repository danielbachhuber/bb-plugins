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

export const nextListSchema = z.object({
  items: z.array(itemSchema),
  sources: z.array(sourceStatusSchema),
  /** When this sync finished. ISO 8601. */
  fetchedAt: z.string(),
});
export type NextList = z.infer<typeof nextListSchema>;

/** The stored list, and whether a sync is running now. */
export const listingSchema = z.object({
  /** Null until the first sync finishes. */
  list: nextListSchema.nullable(),
  syncing: z.boolean(),
});
export type Listing = z.infer<typeof listingSchema>;

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
});

/** Published after a sync starts or finishes; the page re-reads the listing. */
export const SYNC_CHANNEL = "next-synced";
