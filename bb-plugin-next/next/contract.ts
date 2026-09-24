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
  }),
]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const nextListSchema = z.object({
  items: z.array(itemSchema),
  sources: z.array(sourceStatusSchema),
  fetchedAt: z.string(),
});
export type NextList = z.infer<typeof nextListSchema>;

export const rpcContract = defineRpcContract({
  items_list: {
    input: z.null(),
    output: nextListSchema,
  },
});
