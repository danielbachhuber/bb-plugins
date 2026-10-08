// The RPC contract between server.ts and app.tsx.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** Published with `{ threadIds }` after new usage is recorded. */
export const USAGE_CHANNEL = "usage-changed";

/** Published with `{ threadIds }` after a thread's context size is recorded. */
export const CONTEXT_CHANNEL = "context-changed";

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
  /** When it was archived or deleted; null while it is active. */
  archivedAt: z.number().nullable(),
  turns: z.number(),
  /** Its latest recorded context size, or null before any. */
  context: z.number().nullable(),
  /** Each of its finished turns that started in the window: when, and how long it took in milliseconds; oldest first. */
  turnTimes: z.array(z.object({ at: z.number(), ms: z.number() })).optional(),
  /** Its tokens per hour in the window, for its sparkline. */
  hours: z.array(z.object({ hour: z.number(), total: z.number() })),
  ...tokens,
});

/** How many of a thread's latest usage rows the header and its summary read. */
export const MAX_ROWS = 1_000;

export const usageAtSchema = z.object({ at: z.number(), ...tokens });

export const turnDetailSchema = z.object({
  turnId: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  usageAt: z.number(),
  prompt: z.string().nullable(),
  /** Where the turn's time went, in milliseconds; null before timings were recorded or while it runs. */
  time: z.object({ model: z.number(), tools: z.number(), waiting: z.number() }).nullable().optional(),
  ...tokens,
});

const thresholdsSchema = z.object({ warning: z.number().nullable(), error: z.number().nullable() });

const splitSchema = z.object({ model: z.number(), tools: z.number(), waiting: z.number() });

/** Where the period's finished turns spent their time. See timeBreakdown. */
export const turnTimeSchema = z.object({
  turns: z.number(),
  split: splitSchema,
  kinds: z.array(z.object({ kind: z.string(), ms: z.number(), count: z.number() })),
  questions: z.number(),
  lengths: z.array(z.object({ turns: z.number(), split: splitSchema })),
  /** The shell commands that took the most time, grouped by commandKey. */
  commands: z.array(
    z.object({ command: z.string(), runs: z.number(), totalMs: z.number(), medianMs: z.number(), longestMs: z.number() }),
  ),
});

export type TurnTimeBreakdown = z.infer<typeof turnTimeSchema>;

export const rpcContract = defineRpcContract({
  usage_window: {
    input: z.object({ since: z.number().int().nonnegative() }),
    output: z.object({
      hours: z.array(hourUsageSchema),
      threads: z.array(threadUsageSchema),
      /** When this plugin started recording; earlier hours may be missing turns. */
      recordingSince: z.number(),
      /** The context warning and error settings in tokens; null when one is off. */
      contextThresholds: thresholdsSchema,
      turnTime: turnTimeSchema,
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
      /** The latest usage rows, up to MAX_ROWS, oldest first, subagents' calls included. */
      recent: z.array(usageAtSchema),
      /** Claude Code subagents the thread ran and the tokens they used, which bb does not report. */
      subagents: z.object({ count: z.number(), tokens: z.number() }),
    }),
  },
  /** The thread's usage by turn, with the message that began each. Reads bb, so it runs when the summary opens. */
  thread_turns: {
    input: z.object({ threadId: z.string().min(1).max(200) }),
    output: z.object({ turns: z.array(turnDetailSchema) }),
  },
  /**
   * The thread's latest context size and the warning setting, for the meter
   * above the composer. Null `context` means none recorded yet.
   */
  thread_context: {
    input: z.object({ threadId: z.string().min(1).max(200) }),
    output: z.object({
      context: z
        .object({
          usedTokens: z.number(),
          contextWindow: z.number().nullable(),
          autoCompactAt: z.number().nullable(),
          at: z.number(),
        })
        .nullable(),
      /** Tokens the thread's latest recorded turn used. */
      lastTurn: z.number().nullable(),
      /** The context warning and error settings in tokens; null when one is off. */
      thresholds: thresholdsSchema,
      /** Archived or deleted threads get no meter. */
      archived: z.boolean(),
    }),
  },
  /** How many active threads have their latest context past the warning setting, and past the error one, for the sidebar. */
  context_levels: {
    input: z.null(),
    output: z.object({ warning: z.number(), error: z.number() }),
  },
  /** Asks bb to compact the thread, which runs /compact as a turn. Only an idle or errored thread can. */
  compact_thread: {
    input: z.object({ threadId: z.string().min(1).max(200) }),
    output: z.object({ ok: z.literal(true) }),
  },
});

export type HourUsage = z.infer<typeof hourUsageSchema>;
export type ThreadUsage = z.infer<typeof threadUsageSchema>;
export type UsageAt = z.infer<typeof usageAtSchema>;
export type TurnDetail = z.infer<typeof turnDetailSchema>;
