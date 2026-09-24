// Argv parsing for `bb overview …`, kept pure so the grammar is testable
// without a server. server.ts owns the effects; this only decides what was
// asked.
//
// The CLI is the agent's main way in. bb exposes plugin tools through its MCP
// bridge as deferred, namespaced entries, and a model will not spend a
// tool-search round trip on bookkeeping mid-task. Bash is never deferred.

import type { StepStatus } from "./types.js";

export type OverviewCommand =
  | { kind: "show" }
  | { kind: "summary"; text: string }
  | { kind: "add"; texts: string[] }
  | { kind: "status"; refs: string[]; status: StepStatus }
  | { kind: "help" }
  | { kind: "error"; message: string };

const USAGE = [
  "Usage:",
  "  bb overview                        Show this thread's summary and steps",
  '  bb overview summary "text"         Set or replace the summary',
  '  bb overview add "step" ["step"]    Append high-level steps',
  '  bb overview start "step or id"     Mark the step you are starting',
  '  bb overview done "step or id"      Mark steps done',
  '  bb overview reopen "step or id"    Mark steps not started again',
  "",
  "Steps are matched by id or by their own text. Steps cannot be removed:",
  "a superseded step is marked done.",
].join("\n");

export function usage(): string {
  return USAGE;
}

const STATUS_VERBS: Record<string, StepStatus> = {
  start: "current",
  done: "done",
  complete: "done",
  reopen: "todo",
};

/** `argv` is everything after `bb overview`. No arguments shows the overview. */
export function parseCommand(argv: readonly string[]): OverviewCommand {
  const [verb, ...rest] = argv;
  if (verb === undefined) return { kind: "show" };
  const args = rest.filter((item) => item.trim() !== "");

  switch (verb) {
    case "show":
    case "list":
      return { kind: "show" };
    case "help":
    case "--help":
    case "-h":
      return { kind: "help" };
    case "summary":
      // Unquoted words are joined, so `bb overview summary Add a CSV export`
      // does what it looks like it does.
      return args.length === 0
        ? { kind: "error", message: 'summary needs text, e.g. bb overview summary "Add a CSV export"' }
        : { kind: "summary", text: args.join(" ") };
    case "add":
      return args.length === 0
        ? { kind: "error", message: 'add needs at least one step, e.g. bb overview add "Write the export"' }
        : { kind: "add", texts: args };
  }

  const status = STATUS_VERBS[verb];
  if (status) {
    return args.length === 0
      ? { kind: "error", message: `${verb} needs at least one step id or text` }
      : { kind: "status", refs: args, status };
  }
  return { kind: "error", message: `Unknown command "${verb}". Run bb overview help.` };
}
