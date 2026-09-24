// bb-plugin-thread-overview — backend entry.
//
// Owns each thread's overview: a short summary and its high-level steps. The
// agent writes through `bb overview` and five native tools; you write through
// the band's RPC methods; threads started under Thread Todos write through its
// forwarding stub. Every change lands in one store and publishes on one
// realtime channel, so every band showing the thread moves together.
//
// Nothing here calls a model. This plugin records what a thread decided.

import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { parseCommand, usage } from "./overview/cli.js";
import { REALTIME_CHANNEL, rpcContract } from "./overview/contract.js";
import {
  IMPORT_META_KEY,
  THREAD_TODOS_PLUGIN_ID,
  stepsFromTodos,
  todosExportSchema,
} from "./overview/import.js";
import { threadInstructions } from "./overview/instructions.js";
import { renderForAgent } from "./overview/steps.js";
import { MIGRATIONS, OverviewStore } from "./overview/store.js";
import { ADD_MAX, SUMMARY_MAX, TEXT_MAX, type StepStatus } from "./overview/types.js";

export { rpcContract };

const TOOL_NAMES = [
  "overview_summary",
  "overview_add",
  "overview_start",
  "overview_done",
  "overview_reopen",
] as const;

const refParams = z.object({
  steps: z
    .array(z.string().min(1))
    .min(1)
    .describe("The steps to change, each an id from a previous call or the step's own text."),
});

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = new OverviewStore(db);

  bb.log.info("loaded");

  /**
   * One signal per change, carrying only the thread. Every band re-reads, so
   * one that missed a message recovers on the next.
   */
  function announce(threadId: string): void {
    bb.realtime.publish(REALTIME_CHANNEL, { threadId, at: Date.now() });
  }

  function summary(threadId: string, text: string): string {
    const changed = store.setSummary(threadId, text, "agent");
    if (changed) announce(threadId);
    return `${changed ? "Summary set." : "Summary unchanged."}\n\n${renderForAgent(store.get(threadId))}`;
  }

  function add(threadId: string, texts: string[]): string {
    const created = store.addSteps(threadId, texts, "agent");
    if (created.length > 0) announce(threadId);
    const preamble =
      created.length === texts.length
        ? `Added ${created.length}.`
        : `Added ${created.length} of ${texts.length}; the rest were already on the plan.`;
    return `${preamble}\n\n${renderForAgent(store.get(threadId))}`;
  }

  function setStatus(threadId: string, refs: string[], status: StepStatus): string {
    const { changed, unmatched } = store.setStatus(threadId, refs, status, "agent");
    if (changed.length > 0) announce(threadId);
    const verb = { todo: "Reopened", current: "Started", done: "Completed" }[status];
    const missed =
      unmatched.length > 0
        ? ` No step matched: ${unmatched.join(", ")}. Use an id from the list below.`
        : "";
    return `${verb} ${refs.length - unmatched.length}.${missed}\n\n${renderForAgent(store.get(threadId))}`;
  }

  bb.agents.registerTool({
    name: "overview_summary",
    description:
      "Set or replace this thread's summary, shown to the user in a band under " +
      "the thread's header: 2 to 4 sentences on what the thread is for, what has " +
      "been done so far, and any open question. Rewrite it as each step lands.",
    parameters: z.object({
      summary: z.string().min(1).max(SUMMARY_MAX * 2).describe("The whole summary."),
    }),
    presentation: {
      label: { pending: "Updating the overview", completed: "Updated the overview" },
      icon: { glyph: "ListTodo" },
    },
    execute: ({ summary: text }, ctx) => summary(ctx.threadId, text),
  });

  bb.agents.registerTool({
    name: "overview_add",
    description:
      "Append high-level steps to this thread's overview: the plan as you would " +
      "tell it to someone, 3 to 7 steps, not individual edits. Steps already on " +
      "the plan are skipped.",
    parameters: z.object({
      steps: z
        .array(z.string().min(1).max(TEXT_MAX * 2))
        .min(1)
        .max(ADD_MAX)
        .describe("The steps to add, in the order you intend to do them."),
    }),
    presentation: {
      label: { pending: "Adding steps", completed: "Added steps" },
      icon: { glyph: "ListTodo" },
    },
    execute: ({ steps }, ctx) => add(ctx.threadId, steps),
  });

  bb.agents.registerTool({
    name: "overview_start",
    description:
      "Mark the step you are starting as current. Only one step is current; the " +
      "previous one goes back to not started unless you marked it done.",
    parameters: refParams,
    presentation: {
      label: { pending: "Starting a step", completed: "Started a step" },
      icon: { glyph: "Target" },
    },
    execute: ({ steps }, ctx) => setStatus(ctx.threadId, steps, "current"),
  });

  bb.agents.registerTool({
    name: "overview_done",
    description:
      "Mark steps done as each one lands. Steps cannot be removed; a superseded " +
      "step is marked done.",
    parameters: refParams,
    presentation: {
      label: { pending: "Completing steps", completed: "Completed steps" },
      icon: { glyph: "CircleCheck" },
    },
    execute: ({ steps }, ctx) => setStatus(ctx.threadId, steps, "done"),
  });

  bb.agents.registerTool({
    name: "overview_reopen",
    description: "Mark steps not started again, when one you finished turns out not to be.",
    parameters: refParams,
    presentation: {
      label: { pending: "Reopening steps", completed: "Reopened steps" },
      icon: { glyph: "ListTodo" },
    },
    execute: ({ steps }, ctx) => setStatus(ctx.threadId, steps, "todo"),
  });

  // Tools and instructions resolve at thread.start / turn.submit, for every
  // thread: which threads sprawl is not knowable in advance. Both log, because
  // an instruction never delivered and one delivered and ignored look the same
  // from outside.
  bb.agents.configure((context) => {
    bb.log.info(`selecting tools for ${context.thread.id} on ${context.provider.id}`);
    return { tools: [...TOOL_NAMES], skills: [] };
  });
  bb.agents.contributeInstructions(({ threadId }) => {
    const overview = store.get(threadId);
    bb.log.info(
      `contributing instructions to ${threadId} with ${overview.steps.length} steps`,
    );
    return threadInstructions(overview);
  });

  bb.cli.register({
    name: "overview",
    summary: "Read and update this thread's summary and high-level steps.",
    commands: [
      { name: "show", summary: "Show the summary and steps (the default).", usage: "bb overview" },
      { name: "summary", summary: "Set or replace the summary.", usage: 'bb overview summary "Add a CSV export"' },
      { name: "add", summary: "Append steps.", usage: 'bb overview add "Write the export" ["Open a PR"]' },
      { name: "start", summary: "Mark the step you are starting.", usage: 'bb overview start "Write the export"' },
      { name: "done", summary: "Mark steps done.", usage: 'bb overview done "Write the export"' },
      { name: "reopen", summary: "Mark steps not started again.", usage: 'bb overview reopen "Write the export"' },
    ],
    run: (argv, ctx) => {
      const threadId = ctx.threadId;
      if (!threadId) {
        return {
          exitCode: 1,
          stderr: "bb overview works inside a thread; this call carried no thread id.\n",
        };
      }
      const command = parseCommand(argv);
      switch (command.kind) {
        case "help":
          return { exitCode: 0, stdout: `${usage()}\n` };
        case "error":
          return { exitCode: 1, stderr: `${command.message}\n` };
        case "show":
          return { exitCode: 0, stdout: `${renderForAgent(store.get(threadId))}\n` };
        case "summary":
          return { exitCode: 0, stdout: `${summary(threadId, command.text)}\n` };
        case "add":
          return { exitCode: 0, stdout: `${add(threadId, command.texts)}\n` };
        case "status":
          return { exitCode: 0, stdout: `${setStatus(threadId, command.refs, command.status)}\n` };
      }
    },
  });

  bb.rpc.register(rpcContract, {
    overview_get: ({ threadId }) => ({ overview: store.get(threadId) }),
    overview_set_summary: ({ threadId, summary: text, source }) => {
      if (store.setSummary(threadId, text, source)) announce(threadId);
      return { overview: store.get(threadId) };
    },
    overview_add: ({ threadId, texts, source }) => {
      const created = store.addSteps(threadId, texts, source);
      if (created.length > 0) announce(threadId);
      return { overview: store.get(threadId), created: created.length };
    },
    overview_set_status: ({ threadId, refs, status, source }) => {
      const { changed, unmatched } = store.setStatus(threadId, refs, status, source);
      if (changed.length > 0) announce(threadId);
      return { overview: store.get(threadId), changed: changed.length, unmatched };
    },
    overview_remove: ({ threadId, id }) => {
      if (store.removeStep(threadId, id)) announce(threadId);
      return { overview: store.get(threadId) };
    },
    // Whether the band is open is yours alone, so it does not announce.
    overview_set_view: ({ threadId, expanded }) => {
      store.setExpanded(threadId, expanded);
      return { overview: store.get(threadId) };
    },
  });

  // Archiving is not a trigger: an archived thread can come back, and its
  // overview is how you would remember what it was for.
  bb.events.on("thread.deleted", ({ thread }) => {
    const dropped = store.dropThread(thread.id);
    if (dropped > 0) {
      bb.log.info(`dropped ${dropped} steps for deleted thread ${thread.id}`);
      announce(thread.id);
    }
  });

  // Once, the first time Thread Overview and the Thread Todos stub are both
  // running. Not awaited: startup should not wait on another plugin. bb may
  // load Thread Todos after this one, so a miss is retried a few times before
  // waiting for the next start.
  const IMPORT_DELAYS_MS = [0, 15_000, 60_000, 300_000];
  let importTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleImport(attempt: number): void {
    const delay = IMPORT_DELAYS_MS[attempt];
    if (delay === undefined) return;
    importTimer = setTimeout(() => {
      void importThreadTodos().then((done) => {
        if (!done) scheduleImport(attempt + 1);
      });
    }, delay);
  }
  scheduleImport(0);

  /** True once the import has run, now or on an earlier start. */
  async function importThreadTodos(): Promise<boolean> {
    if (store.meta(IMPORT_META_KEY) !== null) return true;
    let exported: z.infer<typeof todosExportSchema>;
    try {
      exported = await bb.sdk.plugins.callRpc({
        pluginId: THREAD_TODOS_PLUGIN_ID,
        method: "todos_export",
        input: {} as never,
        outputSchema: todosExportSchema,
      });
    } catch (error) {
      bb.log.info(
        `Thread Todos import skipped for now (${error instanceof Error ? error.message : String(error)}); ` +
          "will retry",
      );
      return false;
    }
    const result = store.importSteps(stepsFromTodos(exported.todos));
    store.setMeta(
      IMPORT_META_KEY,
      JSON.stringify({ at: Date.now(), exported: exported.todos.length, ...result }),
    );
    bb.log.info(
      `imported ${result.steps} of ${exported.todos.length} Thread Todos items across ${result.threads} threads`,
    );
    for (const threadId of new Set(exported.todos.map((todo) => todo.threadId))) announce(threadId);
    return true;
  }

  bb.onDispose(() => {
    if (importTimer !== null) clearTimeout(importTimer);
    bb.log.info("disposed");
  });
}
