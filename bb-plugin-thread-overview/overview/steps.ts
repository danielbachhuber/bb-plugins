// Pure overview logic: normalizing what arrives, deciding what an add actually
// creates, resolving the loose references a model passes, keeping one step
// current, and deriving every label the band and the agent see.
//
// Same input, same output. No database, no clock, no bb API. The store passes
// the current rows in and applies whatever comes back.

import {
  SUMMARY_MAX,
  TEXT_MAX,
  type Overview,
  type Step,
  type StepStatus,
} from "./types.js";

function elide(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Collapse whitespace and elide. Models hand back steps with leading bullets
 * from their own prose; stripping the bullet keeps the band from showing
 * "- - Fix the parser".
 */
export function normalizeText(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  const unbulleted = collapsed.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
  return elide(unbulleted, TEXT_MAX);
}

/** A summary keeps its sentences but not a model's stray line breaks. */
export function normalizeSummary(raw: string): string {
  return elide(raw.replace(/\s+/g, " ").trim(), SUMMARY_MAX);
}

/** Case- and punctuation-insensitive key, for deciding "we already have this". */
function dedupeKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Which proposed texts are genuinely new for this thread.
 *
 * Steps are never removed by the agent, so one restating its plan on a later
 * turn would otherwise double every step. Matching ignores finished steps:
 * re-adding one you finished is a legitimate way to say it came back.
 */
export function newTexts(existing: readonly Step[], proposed: readonly string[]): string[] {
  const taken = new Set(
    existing.filter((step) => step.status !== "done").map((step) => dedupeKey(step.text)),
  );
  const added: string[] = [];
  for (const raw of proposed) {
    const text = normalizeText(raw);
    const key = dedupeKey(text);
    // A stray bullet or a row of dashes is not a step, and would otherwise
    // share the empty key with every other one.
    if (key === "") continue;
    if (taken.has(key)) continue;
    taken.add(key);
    added.push(text);
  }
  return added;
}

/**
 * Resolve the references a model passes to start/done/reopen: exact id, then
 * exact normalized text, then a unique prefix. Ambiguous references resolve to
 * nothing rather than guessing, because marking the wrong step done is worse
 * than saying the reference missed.
 */
export function resolveRefs(
  steps: readonly Step[],
  refs: readonly string[],
): { matched: Step[]; unmatched: string[] } {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const byText = new Map<string, Step[]>();
  for (const step of steps) {
    const key = dedupeKey(step.text);
    byText.set(key, [...(byText.get(key) ?? []), step]);
  }

  const matched: Step[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const step = resolveOne(ref);
    if (!step) {
      unmatched.push(ref);
      continue;
    }
    if (seen.has(step.id)) continue;
    seen.add(step.id);
    matched.push(step);
  }
  return { matched, unmatched };

  function resolveOne(ref: string): Step | null {
    const direct = byId.get(ref.trim());
    if (direct) return direct;

    const key = dedupeKey(normalizeText(ref));
    if (key === "") return null;

    const exact = byText.get(key);
    if (exact?.length === 1) return exact[0]!;
    if (exact && exact.length > 1) return null;

    const prefixed = steps.filter((step) => dedupeKey(step.text).startsWith(key));
    return prefixed.length === 1 ? prefixed[0]! : null;
  }
}

/**
 * The status changes that setting `targets` to `status` implies.
 *
 * Only one step is current at a time: making a step current sends any other
 * current step back to `todo`. When several targets are asked to become
 * current at once, the last one wins, which matches reading the call left to
 * right.
 */
export function statusChanges(
  steps: readonly Step[],
  targets: readonly Step[],
  status: StepStatus,
): { id: string; status: StepStatus }[] {
  const next = new Map(steps.map((step) => [step.id, step.status]));
  if (status === "current") {
    const winner = targets.at(-1);
    for (const step of steps) {
      if (next.get(step.id) === "current" && step.id !== winner?.id) next.set(step.id, "todo");
    }
    if (winner) next.set(winner.id, "current");
  } else {
    for (const target of targets) next.set(target.id, status);
  }
  return steps
    .filter((step) => next.get(step.id) !== step.status)
    .map((step) => ({ id: step.id, status: next.get(step.id)! }));
}

/** What a click on a step in the band does: todo, then current, then done. */
export function nextStatus(status: StepStatus): StepStatus {
  if (status === "todo") return "current";
  if (status === "current") return "done";
  return "todo";
}

export function orderSteps(steps: readonly Step[]): Step[] {
  return [...steps].sort((a, b) => a.position - b.position);
}

/**
 * Where the thread is. With no step marked current, the first unfinished step
 * stands in, so a plan the agent never marked still reads as progress.
 */
export function progress(steps: readonly Step[]): {
  done: number;
  total: number;
  /** 1-based position of the step shown as current, or null when all are done. */
  number: number | null;
  current: Step | null;
} {
  const ordered = orderSteps(steps);
  const done = ordered.filter((step) => step.status === "done").length;
  const explicit = ordered.findIndex((step) => step.status === "current");
  const index = explicit >= 0 ? explicit : ordered.findIndex((step) => step.status !== "done");
  return {
    done,
    total: ordered.length,
    number: index >= 0 ? index + 1 : null,
    current: index >= 0 ? ordered[index]! : null,
  };
}

/** "2/4", or "4/4" when finished, or "" with no steps. */
export function stepCount(steps: readonly Step[]): string {
  const { total, number, done } = progress(steps);
  if (total === 0) return "";
  return `${number ?? done}/${total}`;
}

/** The collapsed band and the header fallback: the step first, then the summary. */
export function collapsedLine(overview: Pick<Overview, "summary" | "steps">): {
  count: string;
  step: string;
  summary: string;
} {
  const { current, total } = progress(overview.steps);
  return {
    count: stepCount(overview.steps),
    step: current?.text ?? (total > 0 ? "All steps done" : ""),
    summary: overview.summary,
  };
}

/** Whether there is anything to show at all. */
export function isEmpty(overview: Pick<Overview, "summary" | "steps">): boolean {
  return overview.summary === "" && overview.steps.length === 0;
}

/**
 * Whether the band has nothing to tell you: no summary, and nothing left to
 * do. Most threads imported from Thread Todos are like this, a long list of
 * finished items and no summary, and drawing them in full is noise.
 */
export function isQuiet(overview: Pick<Overview, "summary" | "steps">): boolean {
  return overview.summary === "" && overview.steps.every((step) => step.status === "done");
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function updatedLabel(at: number, now: number): string {
  if (at <= 0) return "";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "updated just now";
  if (minutes < 60) return `updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `updated ${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `updated ${days} ${days === 1 ? "day" : "days"} ago`;
}

/** The header fallback's accessible name, since "2/4" says nothing aloud. */
export function headerAriaLabel(overview: Pick<Overview, "summary" | "steps">): string {
  const { total, number, current } = progress(overview.steps);
  if (isEmpty(overview)) return "Thread overview: none yet";
  if (total === 0) return "Thread overview";
  if (number === null) return `Thread overview: all ${total} steps done`;
  return `Thread overview: step ${number} of ${total}, ${current!.text}`;
}

const MARK: Record<StepStatus, string> = { todo: "[ ]", current: "[>]", done: "[x]" };

/** What `bb overview` and the tools hand back, so the agent sees ids and state. */
export function renderForAgent(overview: Pick<Overview, "summary" | "steps">): string {
  const summary = overview.summary === "" ? "(none yet)" : overview.summary;
  const ordered = orderSteps(overview.steps);
  const steps =
    ordered.length === 0
      ? "(none yet)"
      : ordered.map((step) => `${MARK[step.status]} ${step.id}  ${step.text}`).join("\n");
  const { total, done } = progress(overview.steps);
  const tail = total === 0 ? "" : `\n\n${done} of ${total} done. [>] is the current step.`;
  return `Summary: ${summary}\n\nSteps:\n${steps}${tail}`;
}

/**
 * The band's step column: unfinished steps first, in plan order, then
 * finished ones, most recently finished first. What is left is what you came
 * back for; the finished list is history, and scrolls.
 */
export function stepColumn(steps: readonly Step[]): { unfinished: Step[]; finished: Step[] } {
  const ordered = orderSteps(steps);
  return {
    unfinished: ordered.filter((step) => step.status !== "done"),
    finished: ordered
      .filter((step) => step.status === "done")
      .sort((a, b) => b.updatedAt - a.updatedAt || b.position - a.position),
  };
}
