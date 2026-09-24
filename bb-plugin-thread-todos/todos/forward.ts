// Thread Todos now forwards to Thread Overview. Threads started before the
// switch were told, in instructions they keep until their session restarts,
// to run `bb todo` and call `todo_*`. This turns each of those calls into the
// matching Thread Overview RPC and renders the answer in the list format those
// threads already read.
//
// The rendering is pure; `createOverviewBridge` is the only I/O.

import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { renderForAgent } from "./list.js";
import type { Todo } from "./types.js";

export const THREAD_OVERVIEW_PLUGIN_ID = "thread-overview";

const stepSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  text: z.string(),
  status: z.enum(["todo", "current", "done"]),
  source: z.enum(["agent", "user"]),
  position: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type OverviewStep = z.infer<typeof stepSchema>;

const overview = z.object({ steps: z.array(stepSchema) }).passthrough();
const getOutput = z.object({ overview });
const addOutput = z.object({ overview, created: z.number() });
const statusOutput = z.object({ overview, changed: z.number(), unmatched: z.array(z.string()) });

/** A step as the old list shape: current and not-started both read as open. */
export function todoFromStep(step: OverviewStep): Todo {
  return { ...step, status: step.status === "done" ? "done" : "open" };
}

export function renderSteps(steps: readonly OverviewStep[]): string {
  return renderForAgent(steps.map(todoFromStep));
}

export interface OverviewBridge {
  list(threadId: string): Promise<string>;
  add(threadId: string, texts: string[]): Promise<string>;
  setStatus(threadId: string, refs: string[], status: "open" | "done"): Promise<string>;
}

/**
 * Every method throws when Thread Overview is missing, with a message a
 * thread can act on, rather than answering with an empty list that would read
 * as "nothing left to do".
 */
export function createOverviewBridge(bb: BbPluginApi): OverviewBridge {
  async function call<T>(method: string, outputSchema: z.ZodType<T>, input: unknown): Promise<T> {
    try {
      return await bb.sdk.plugins.callRpc({
        pluginId: THREAD_OVERVIEW_PLUGIN_ID,
        method,
        outputSchema,
        input: input as never,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `bb todo now forwards to Thread Overview, which did not answer (${reason}). ` +
          "Install or enable the thread-overview plugin, or use bb overview.",
      );
    }
  }

  return {
    async list(threadId) {
      const result = await call("overview_get", getOutput, { threadId });
      return renderSteps(result.overview.steps);
    },
    async add(threadId, texts) {
      const result = await call("overview_add", addOutput, { threadId, texts, source: "agent" });
      const preamble =
        result.created === texts.length
          ? `Added ${result.created}.`
          : `Added ${result.created} of ${texts.length}; the rest were already open.`;
      return `${preamble}\n\n${renderSteps(result.overview.steps)}`;
    },
    async setStatus(threadId, refs, status) {
      const result = await call("overview_set_status", statusOutput, {
        threadId,
        refs,
        status: status === "done" ? "done" : "todo",
        source: "agent",
      });
      const verb = status === "done" ? "Completed" : "Reopened";
      const missed =
        result.unmatched.length > 0
          ? ` No item matched: ${result.unmatched.join(", ")}. Use an id from the list below.`
          : "";
      return `${verb} ${refs.length - result.unmatched.length}.${missed}\n\n${renderSteps(result.overview.steps)}`;
    },
  };
}
