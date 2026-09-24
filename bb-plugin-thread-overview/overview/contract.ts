// The RPC wire contract. server.ts registers handlers against it; app.tsx
// imports only its type; the Thread Todos stub calls the add and status
// methods to forward `bb todo`. A field missing from these schemas is dropped
// by the server, and the band renders without it.

import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { ADD_MAX, SUMMARY_MAX, TEXT_MAX } from "./types.js";

export const stepSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  text: z.string(),
  status: z.enum(["todo", "current", "done"]),
  source: z.enum(["agent", "user"]),
  position: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const overviewSchema = z.object({
  threadId: z.string(),
  summary: z.string(),
  steps: z.array(stepSchema),
  updatedAt: z.number(),
});

const threadId = z.string().min(1);
const source = z.enum(["agent", "user"]);
const overviewOutput = z.object({ overview: overviewSchema });

export const rpcContract = defineRpcContract({
  overview_get: {
    input: z.object({ threadId }).strict(),
    output: overviewOutput,
  },
  overview_set_summary: {
    input: z
      .object({ threadId, summary: z.string().max(SUMMARY_MAX * 2), source })
      .strict(),
    output: overviewOutput,
  },
  overview_add: {
    input: z
      .object({
        threadId,
        texts: z.array(z.string().min(1).max(TEXT_MAX * 2)).min(1).max(ADD_MAX),
        source,
      })
      .strict(),
    output: overviewOutput.extend({ created: z.number() }),
  },
  overview_set_status: {
    input: z
      .object({
        threadId,
        refs: z.array(z.string().min(1)).min(1),
        status: z.enum(["todo", "current", "done"]),
        source,
      })
      .strict(),
    output: overviewOutput.extend({ changed: z.number(), unmatched: z.array(z.string()) }),
  },
  overview_remove: {
    input: z.object({ threadId, id: z.string().min(1) }).strict(),
    output: overviewOutput,
  },
});

/** The realtime channel every band watches. */
export const REALTIME_CHANNEL = "overview";
