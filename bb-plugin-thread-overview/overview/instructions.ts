// What every thread is told about its overview.
//
// Kept short, because it rides on every turn of every thread and a long block
// competes with the task for attention. It leads with the CLI: Thread Todos
// found that agents never reached for the deferred MCP tools, but do run a
// shell command.
//
// The current overview is embedded AND the agent is told to re-read it. A live
// provider session keeps the instructions it started with, so an edit you make
// mid-session reaches the agent only through `bb overview`.

import { orderSteps } from "./steps.js";
import type { Overview } from "./types.js";

/**
 * The SDK truncates a contribution past 4,096 characters. The static block is
 * about 1,700, which leaves this for the embedded overview with room to spare.
 */
const EMBED_BUDGET = 1800;

const STATIC_BLOCK = [
  "## This thread's overview",
  "",
  "bb shows a band under this thread's header with a short summary of what the",
  "thread is for and how far it has got, and its high-level steps. It is how",
  "the user, returning after working elsewhere, tells what this thread is",
  "doing without reading the transcript. Keeping it current is part of the job.",
  "",
  "Use the `bb overview` CLI through your normal shell tool:",
  "",
  "```sh",
  "bb overview                                  # read it",
  'bb overview summary "Add a CSV export to …"  # set or replace the summary',
  'bb overview add "Write the export" "Open a PR"',
  'bb overview start "Write the export"         # the step you are on now',
  'bb overview done "Write the export"',
  "```",
  "",
  "**Run `bb overview` at the start of each turn.** The user edits it too, and",
  "the copy below is only current as of when this session started.",
  "",
  "- On the first turn that does real work, write the summary and the steps.",
  "  A one-line question or a single edit needs neither.",
  "- The summary is 2 or 3 short sentences, under 300 characters, written for",
  "  someone returning cold: what the thread is for, what has been done so far,",
  "  and any open question the user needs to answer. \"So far\" is the result,",
  "  not the activity:",
  "  \"The export works and is tested\", not \"Worked on the export\".",
  "  Rewrite it as each step lands and whenever the goal changes.",
  "- Steps are the plan as you would tell it to someone: 3 to 7 of them, not",
  "  individual edits or test runs.",
  "- `start` a step when you begin it and `done` it when it lands, not in a",
  "  batch at the end.",
  "- Steps cannot be removed. When one is superseded, mark it done and add",
  "  what replaced it. Steps the user added are theirs to change.",
  "",
  "Equivalent tools (`overview_summary`, `overview_add`, `overview_start`,",
  "`overview_done`, `overview_reopen`) exist if your harness lists them",
  "directly. Prefer the CLI.",
].join("\n");

const MARK = { todo: "[ ]", current: "[>]", done: "[x]" } as const;

/**
 * The overview as the agent sees it at session start. Unfinished steps are
 * listed before finished ones when the budget runs short, and the agent is
 * told what it is not seeing, so a cut list never reads as complete.
 */
export function renderOverviewSection(overview: Pick<Overview, "summary" | "steps">): string {
  if (overview.summary === "" && overview.steps.length === 0) {
    return [
      "### Current overview",
      "",
      "None yet. If this thread involves real work, write one before starting.",
    ].join("\n");
  }

  const summary = overview.summary === "" ? "(none yet; write one)" : overview.summary;
  const ordered = orderSteps(overview.steps);
  const unfinished = ordered.filter((step) => step.status !== "done");
  const finished = ordered.filter((step) => step.status === "done");

  let used = summary.length;
  const shown = new Set<string>();
  for (const step of [...unfinished, ...finished]) {
    const length = step.id.length + step.text.length + 8;
    if (used + length > EMBED_BUDGET) break;
    used += length;
    shown.add(step.id);
  }

  const lines = ordered
    .filter((step) => shown.has(step.id))
    .map((step) => `${MARK[step.status]} ${step.id}  ${step.text}`);
  const omitted = ordered.length - shown.size;
  const tail =
    omitted > 0 ? `\n\n${omitted} steps not shown here. Run \`bb overview\` for all of them.` : "";

  return [
    "### Current overview (as of session start)",
    "",
    `Summary: ${summary}`,
    "",
    lines.length > 0 ? lines.join("\n") : "No steps yet.",
  ].join("\n") + tail;
}

export function threadInstructions(overview: Pick<Overview, "summary" | "steps">): string {
  return `${STATIC_BLOCK}\n\n${renderOverviewSection(overview)}`;
}

export const INSTRUCTIONS_STATIC_BLOCK = STATIC_BLOCK;
