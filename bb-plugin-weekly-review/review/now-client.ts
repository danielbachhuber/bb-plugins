/**
 * The only module that calls the Now plugin: writing the week's priorities
 * into it, and reading which ones are checked off there. Each call is one RPC
 * to Now, on this machine, and no outside request. When Now is not installed
 * or fails, it logs and answers null, and this page carries on without it.
 */
import { z } from "zod";

import type { NowPriority } from "./now-priorities.js";

const NOW_PLUGIN = "now";

const nowWeekSchema = z.object({
  items: z.array(z.looseObject({ text: z.string(), doneAt: z.string().nullable() })),
});

interface RpcCaller {
  callRpc<T>(args: { pluginId: string; method: string; input?: never; outputSchema: z.ZodType<T> }): Promise<T>;
}

export interface NowWrite {
  monday: string;
  heading: string;
  hoursAt: string | null;
  items: NowPriority[];
}

export interface NowClient {
  /** Writes the week's list. The texts Now has checked, or null when Now could not be reached. */
  write(week: NowWrite): Promise<Set<string> | null>;
  /** The texts Now has checked for the week, or null when Now could not be reached. */
  done(monday: string): Promise<Set<string> | null>;
}

function checked(week: z.infer<typeof nowWeekSchema> | null): Set<string> {
  return new Set((week?.items ?? []).filter((item) => item.doneAt !== null).map((item) => item.text));
}

export function createNowClient(plugins: RpcCaller, warn: (message: string) => void): NowClient {
  // One warning per kind of failure, not one per call, while Now stays away.
  let warned: string | null = null;
  function failed(cause: unknown): null {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (warned !== message) warn(`Now plugin: ${message}`);
    warned = message;
    return null;
  }
  /** Null when the call failed, so a null answer from Now stays distinct. */
  async function call<T>(method: string, input: unknown, outputSchema: z.ZodType<T>): Promise<{ value: T } | null> {
    try {
      const value = await plugins.callRpc({ pluginId: NOW_PLUGIN, method, input: input as never, outputSchema });
      warned = null;
      return { value };
    } catch (cause) {
      return failed(cause);
    }
  }
  return {
    async write(week) {
      const stored = await call("priorities_set", { ...week, source: "weekly-review" }, nowWeekSchema);
      return stored === null ? null : checked(stored.value);
    },
    async done(monday) {
      const result = await call("priorities_get", { monday }, nowWeekSchema.nullable());
      return result === null ? null : checked(result.value);
    },
  };
}
