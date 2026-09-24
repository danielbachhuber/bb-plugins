// bb-plugin-thread-todos — backend entry.
//
// A forwarding stub. Thread Overview replaced this plugin, but a thread keeps
// the instructions it started with until its session restarts, and every
// thread started before the switch was told to run `bb todo` and call
// `todo_*`. So those still exist here, and each one forwards to Thread
// Overview, which now owns the steps.
//
// It contributes no instructions, so new threads hear only about
// `bb overview`, and it draws no UI. `bb todo last-used` says when a thread
// last called it: once none started before the switch is still running, this
// plugin can be uninstalled.

import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { parseCommand, usage } from "./todos/cli.js";
import { rpcContract } from "./todos/contract.js";
import { createOverviewBridge } from "./todos/forward.js";
import { MIGRATIONS, TodoStore } from "./todos/store.js";
import { ADD_MAX, TEXT_MAX } from "./todos/types.js";

export { rpcContract };

const TOOL_NAMES = ["todo_add", "todo_complete", "todo_reopen"] as const;

const addParams = z.object({
  items: z
    .array(z.string().min(1).max(TEXT_MAX * 2))
    .min(1)
    .max(ADD_MAX)
    .describe("The steps to add, in the order you intend to do them."),
});

const refParams = z.object({
  items: z
    .array(z.string().min(1))
    .min(1)
    .describe("The items to change, each an id from a previous call or the item's own text."),
});

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = new TodoStore(db);
  const overview = createOverviewBridge(bb);

  bb.log.info("loaded as a forwarding stub for Thread Overview");

  /** Record the call, then forward it. A failure becomes the tool's answer. */
  async function forward(threadId: string, via: string, work: () => Promise<string>): Promise<string> {
    store.markUsed(threadId, via);
    bb.log.info(`forwarding ${via} from ${threadId}`);
    try {
      return await work();
    } catch (error) {
      bb.log.warn(`forwarding ${via} from ${threadId} failed: ${describeError(error)}`);
      throw error;
    }
  }

  bb.agents.registerTool({
    name: "todo_add",
    description:
      "Append steps to this thread's plan, which the user sees in bb. " +
      "Forwards to Thread Overview; prefer `bb overview add`.",
    parameters: addParams,
    presentation: {
      label: { pending: "Adding steps", completed: "Added steps" },
      icon: { glyph: "ListTodo" },
    },
    execute: ({ items }, ctx) =>
      forward(ctx.threadId, "todo_add", () => overview.add(ctx.threadId, items)),
  });

  bb.agents.registerTool({
    name: "todo_complete",
    description:
      "Mark steps on this thread's plan as done. Forwards to Thread Overview; " +
      "prefer `bb overview done`.",
    parameters: refParams,
    presentation: {
      label: { pending: "Completing steps", completed: "Completed steps" },
      icon: { glyph: "CircleCheck" },
    },
    execute: ({ items }, ctx) =>
      forward(ctx.threadId, "todo_complete", () => overview.setStatus(ctx.threadId, items, "done")),
  });

  bb.agents.registerTool({
    name: "todo_reopen",
    description:
      "Mark finished steps on this thread's plan as not done. Forwards to " +
      "Thread Overview; prefer `bb overview reopen`.",
    parameters: refParams,
    presentation: {
      label: { pending: "Reopening steps", completed: "Reopened steps" },
      icon: { glyph: "ListTodo" },
    },
    execute: ({ items }, ctx) =>
      forward(ctx.threadId, "todo_reopen", () => overview.setStatus(ctx.threadId, items, "open")),
  });

  // The tools stay selected so a thread started before the switch still finds
  // the ones it was told about. No instructions are contributed: new threads
  // learn about `bb overview` from Thread Overview alone.
  bb.agents.configure(() => ({ tools: [...TOOL_NAMES], skills: [] }));

  bb.cli.register({
    name: "todo",
    summary: "Forwards to Thread Overview (bb overview). Kept for threads started before it.",
    commands: [
      { name: "list", summary: "Show this thread's steps (the default).", usage: "bb todo [list]" },
      { name: "add", summary: "Append one or more steps.", usage: 'bb todo add "Write the parser"' },
      { name: "done", summary: "Mark steps done.", usage: 'bb todo done "Write the parser"' },
      { name: "reopen", summary: "Mark finished steps not done.", usage: 'bb todo reopen "Write the parser"' },
      { name: "last-used", summary: "When a thread last called bb todo.", usage: "bb todo last-used" },
    ],
    run: async (argv, ctx) => {
      const command = parseCommand(argv);
      if (command.kind === "help") return { exitCode: 0, stdout: `${usage()}\n` };
      if (command.kind === "error") return { exitCode: 1, stderr: `${command.message}\n` };
      if (command.kind === "last-used") {
        const last = store.lastUsed();
        return {
          exitCode: 0,
          stdout: last
            ? `Last called ${new Date(last.at).toISOString()} by ${last.threadId} (${last.via}).\n`
            : "No thread has called bb todo since it began forwarding to Thread Overview.\n",
        };
      }

      const threadId = ctx.threadId;
      if (!threadId) {
        return {
          exitCode: 1,
          stderr: "bb todo works inside a thread; this call carried no thread id.\n",
        };
      }
      try {
        const stdout = await forward(threadId, command.kind, () => {
          switch (command.kind) {
            case "list":
              return overview.list(threadId);
            case "add":
              return overview.add(threadId, command.texts);
            case "status":
              return overview.setStatus(threadId, command.refs, command.status);
          }
        });
        return { exitCode: 0, stdout: `${stdout}\n` };
      } catch (error) {
        return { exitCode: 1, stderr: `${describeError(error)}\n` };
      }
    },
  });

  bb.rpc.register(rpcContract, {
    todos_export: () => ({ todos: store.all() }),
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
