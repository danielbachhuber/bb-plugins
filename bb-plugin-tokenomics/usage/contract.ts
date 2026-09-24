// The RPC contract between server.ts and app.tsx.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Published with `{ threadIds }` after new usage is recorded. */
export const USAGE_CHANNEL = "usage-changed";

/** The page's longest range is a week; allow a little over for clock skew. */
export const MAX_WINDOW_MS = 9 * 24 * 3_600_000;

const tokens = {
  input: z.number(),
  cacheRead: z.number(),
  output: z.number(),
};

export const hourUsageSchema = z.object({ hour: z.number(), ...tokens });

export const threadUsageSchema = z.object({
  threadId: z.string(),
  title: z.string().nullable(),
  projectId: z.string(),
  projectName: z.string().nullable(),
  providerId: z.string(),
  turns: z.number(),
  ...tokens,
});

/** How many of a thread's turns the header's sparkline and summary show. */
export const MAX_TURNS = 200;

export const turnUsageSchema = z.object({ at: z.number(), ...tokens });

export const rpcContract = defineRpcContract({
  usage_window: {
    input: z.object({ since: z.number().int().nonnegative() }),
    output: z.object({
      hours: z.array(hourUsageSchema),
      threads: z.array(threadUsageSchema),
      /** When this plugin started recording; earlier hours may be missing turns. */
      recordingSince: z.number(),
    }),
  },
  thread_usage: {
    input: z.object({ threadId: z.string().min(1).max(200) }),
    output: z.object({
      input: z.number(),
      cacheRead: z.number(),
      output: z.number(),
      total: z.number(),
      turns: z.number(),
      /** The latest turns, up to MAX_TURNS, oldest first. */
      recent: z.array(turnUsageSchema),
    }),
  },
});

export type HourUsage = z.infer<typeof hourUsageSchema>;
export type ThreadUsage = z.infer<typeof threadUsageSchema>;
export type TurnUsage = z.infer<typeof turnUsageSchema>;
