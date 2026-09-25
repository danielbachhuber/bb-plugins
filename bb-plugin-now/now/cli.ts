// `bb now`: the Todoist actions the page takes, from a shell, so an agent can
// drive and check them against real tasks. It calls the same functions the
// panel's RPC does. The I/O comes in through `NowCliDeps`.
import { PluginCliError, cliCommand, defineCli, type PluginCliRegistration } from "@get-bb/plugin-sdk";

import { parseDeadline } from "../todoist/deadline.js";
import type { Item } from "./types.js";

export interface NowCliDeps {
  now: () => Date;
  /** The Todoist rows on the page now. */
  tasks: () => Item[];
  /** The task as Todoist holds it, read fresh. */
  fetchTask: (taskId: string) => Promise<unknown>;
  /** Adds a task to the Inbox, syncs, and returns its row id. */
  addTask: (content: string, due: string | undefined) => Promise<string>;
  postpone: (id: string, day: string) => Promise<{ postponed: boolean; error: string | null }>;
  remove: (id: string) => Promise<{ deleted: boolean; error: string | null }>;
}

/** A row id from a bare Todoist id or a row id. */
export function rowId(id: string): string {
  return id.startsWith("todoist:") ? id : `todoist:${id}`;
}

/** One line per task: id, due date, rule, and name. */
export function formatTasks(items: readonly Item[]): string {
  if (items.length === 0) return "No Todoist tasks on the page.\n";
  return items
    .map((item) => {
      const due = item.due === null ? "no date" : item.due.date;
      const rule = item.due?.recurring ? ` (${item.due.text ?? "recurring"})` : "";
      return `${item.id.slice("todoist:".length)}  ${due}${rule}  ${item.title}`;
    })
    .join("\n")
    .concat("\n");
}

const JSON_OPTION = { json: { type: "boolean", description: "Print JSON instead of text" } } as const;

export function nowCli(deps: NowCliDeps): PluginCliRegistration {
  return defineCli({
    name: "now",
    summary: "Drive Now's Todoist actions from a shell: list, add, postpone, and delete tasks.",
    commands: {
      tasks: cliCommand({
        summary: "List the Todoist tasks on the page, with their due dates and repeat rules.",
        options: JSON_OPTION,
        run: ({ options }) => {
          const items = deps.tasks();
          const stdout = options.json
            ? `${JSON.stringify(items.map((item) => ({ id: item.id, title: item.title, due: item.due })))}\n`
            : formatTasks(items);
          return { exitCode: 0, stdout };
        },
      }),
      "task show": cliCommand({
        summary: "Show a task as Todoist holds it now: its name and due object, read fresh.",
        positionals: [{ name: "id", description: "The Todoist task id, with or without todoist:", required: true }],
        run: async ({ positionals }) => {
          const task = (await deps.fetchTask(rowId(positionals.id).slice("todoist:".length))) as Record<string, unknown>;
          const shown = { id: task.id, content: task.content, due: task.due, project_id: task.project_id };
          return { exitCode: 0, stdout: `${JSON.stringify(shown, null, 2)}\n` };
        },
      }),
      "task add": cliCommand({
        summary: "Add a task to your Todoist Inbox, then sync so it is on the page.",
        positionals: [{ name: "content", description: "The task's name", required: true }],
        options: { due: { type: "string", description: 'A due date in words, as Todoist reads them: "every mon 9am"' } },
        run: async ({ positionals, options }) => {
          const id = await deps.addTask(positionals.content, options.due);
          return { exitCode: 0, stdout: `${id}\n` };
        },
      }),
      "task delete": cliCommand({
        summary: "Delete a task for good. Todoist cannot restore it.",
        positionals: [{ name: "id", description: "The Todoist task id, with or without todoist:", required: true }],
        run: async ({ positionals }) => {
          const result = await deps.remove(rowId(positionals.id));
          if (result.error !== null) throw new PluginCliError(result.error, { code: "delete_failed" });
          return { exitCode: 0, stdout: `Deleted ${rowId(positionals.id)}\n` };
        },
      }),
      postpone: cliCommand({
        summary: "Move a recurring task's current occurrence to a later day, keeping its rule and time, as the Postpone menu does.",
        positionals: [
          { name: "id", description: "The Todoist task id, with or without todoist:", required: true },
          { name: "day", description: 'The day: "tomorrow", "fri", "oct 8", or 2026-10-08', required: true },
        ],
        run: async ({ positionals }) => {
          const day = parseDeadline(positionals.day, deps.now());
          if (typeof day !== "string") {
            throw new PluginCliError(`"${positionals.day}" is not a day.`, {
              code: "not_a_day",
              hint: 'Try "tomorrow", "fri", "oct 8", or 2026-10-08.',
            });
          }
          const result = await deps.postpone(rowId(positionals.id), day);
          if (result.error !== null) throw new PluginCliError(result.error, { code: "postpone_failed" });
          return { exitCode: 0, stdout: `Postponed ${rowId(positionals.id)} to ${day}\n` };
        },
      }),
    },
  });
}
