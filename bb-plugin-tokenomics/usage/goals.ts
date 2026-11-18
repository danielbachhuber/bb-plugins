// Thread goals: what a thread is for, the stages that show it is done, an
// estimate of what it will take, and how it ended. Pure functions only; the
// store and the CLI in server.ts do the I/O.
//
// A goal is the higher-level statement of a thread's work, not its next step.
// Its stages are end states someone could check ("PR's checks pass"), never
// tasks ("Fix the test"), and there are at most five of them, because a longer
// list turns into a to-do list nobody reads.

import { formatTokens } from "./series.js";

export const GOAL_SHAPES = ["task", "exploration", "project", "none"] as const;
export type GoalShape = (typeof GOAL_SHAPES)[number];

export const GOAL_SETTERS = ["spawner", "agent", "you"] as const;
export type GoalSetBy = (typeof GOAL_SETTERS)[number];

export const OUTCOMES = ["met", "partly", "not"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Stages past this are refused: split the thread or make it a project. */
export const MAX_STAGES = 5;
/** What the instructions ask for; the fifth is allowed but discouraged. */
export const PREFERRED_STAGES = 4;

export interface Range {
  low: number;
  high: number;
}

export interface GoalEstimate {
  turns: Range | null;
  tokens: Range | null;
  minutes: Range | null;
}

export const NO_ESTIMATE: GoalEstimate = { turns: null, tokens: null, minutes: null };

/** What a goal has used: turns started, tokens (subagents included), and time worked. */
export interface Spent {
  turns: number;
  tokens: number;
  ms: number;
}

export interface Goal {
  id: number;
  threadId: string;
  setAt: number;
  /** Where its spending starts counting: the start of the turn it was set in, or the revision itself. */
  anchorAt: number;
  shape: GoalShape;
  text: string;
  stages: string[];
  /** How many stages are done, in order. */
  reached: number;
  pr: string | null;
  setBy: GoalSetBy;
  /** Why a revision replaced the goal before it; null for a thread's first goal. */
  reason: string | null;
  /** How the thread started: a plugin id, "child", or "typed". */
  origin: string | null;
  estimate: GoalEstimate;
  /** When a later goal replaced this one; null while it is the thread's current goal. */
  replacedAt: number | null;
  outcome: Outcome | null;
  outcomeNote: string | null;
  closedAt: number | null;
  /** What it had used when it was closed or replaced. */
  spentAtEnd: Spent | null;
}

/** How a thread started, from bb's thread record. */
export function originOf(thread: { originPluginId?: string | null; parentThreadId?: string | null }): string {
  if (typeof thread.originPluginId === "string" && thread.originPluginId !== "" && thread.originPluginId !== "mixed") {
    return thread.originPluginId;
  }
  return thread.parentThreadId ? "child" : "typed";
}

export function originLabel(origin: string | null): string {
  if (origin === null) return "threads";
  if (origin === "typed") return "threads with no plugin or parent";
  if (origin === "child") return "threads another thread started";
  return `${origin} threads`;
}

const AMOUNT = /^\s*(\d+(?:\.\d+)?)\s*([kmb])?\s*$/i;

/** A count with an optional K, M, or B, such as "15M". */
export function parseAmount(text: string): number | null {
  const match = AMOUNT.exec(text);
  if (match === null) return null;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(match[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Number(match[1]) * scale;
}

/** "4-8", "5M-15M", or a single "6"; null when it doesn't read as a range. */
export function parseGoalRange(text: string | undefined): Range | null {
  if (text === undefined) return null;
  const parts = text.split(/\s*(?:-|–|\.\.|to)\s*/);
  if (parts.length > 2 || parts.length === 0) return null;
  const low = parseAmount(parts[0]!);
  const high = parts.length === 2 ? parseAmount(parts[1]!) : low;
  if (low === null || high === null || low < 0 || high < low) return null;
  return { low, high };
}

/** Trims the stages and checks the count for the shape; returns an error to print, or the stages. */
export function checkStages(shape: GoalShape, raw: readonly string[]): { stages: string[] } | { error: string } {
  const stages = raw.map((stage) => stage.trim().replace(/\s+/g, " ")).filter((stage) => stage !== "");
  if (shape === "task" && stages.length === 0) {
    return {
      error:
        'A task goal needs its stages: --stage "Export built" --stage "Tests pass". Use --shape exploration for a question, or --none for no goal.',
    };
  }
  if (shape !== "task" && stages.length > 0) {
    return { error: `An ${shape} goal has no stages. Leave out --stage, or use --shape task.` };
  }
  if (stages.length > MAX_STAGES) {
    return {
      error: `${stages.length} stages is too many; ${MAX_STAGES} at most, ${PREFERRED_STAGES} is better. State end states rather than steps, or split the thread or make it a project.`,
    };
  }
  const long = stages.find((stage) => stage.length > 80);
  if (long !== undefined) return { error: `Keep each stage under 80 characters: "${long.slice(0, 40)}…"` };
  return { stages };
}

export const OUTCOME_LABELS: Record<Outcome, string> = { met: "Met", partly: "Partly met", not: "Not met" };

/**
 * The short status the goal band and the sidebar show: "1 of 3 · Export
 * built", "Exploring", "Met". Null for a thread with no goal to show.
 */
export function stageLabel(goal: Pick<Goal, "shape" | "stages" | "reached" | "outcome">): string | null {
  if (goal.shape === "none") return null;
  if (goal.outcome !== null) return OUTCOME_LABELS[goal.outcome];
  if (goal.shape === "exploration") return "Exploring";
  if (goal.shape === "project") return "Project";
  const reached = Math.min(goal.reached, goal.stages.length);
  if (reached === 0) return `0 of ${goal.stages.length}`;
  return `${reached} of ${goal.stages.length} · ${goal.stages[reached - 1]}`;
}

/** What's left of a range once `spent` is used; null when there is no range, "over" once past its top. */
export function remainingOf(range: Range | null, spent: number): Range | "over" | null {
  if (range === null) return null;
  if (spent > range.high) return "over";
  return { low: Math.max(0, range.low - spent), high: range.high - spent };
}

function roundRange(range: Range): string {
  const low = Math.round(range.low);
  const high = Math.round(range.high);
  return low === high ? `${low}` : `${low}–${high}`;
}

/** The goal band's tail: "~2–5 turns left", "past estimate", or null with no turn estimate or once closed. */
export function remainingLabel(goal: Pick<Goal, "estimate" | "outcome" | "shape">, spent: Spent): string | null {
  if (goal.outcome !== null || goal.shape === "none") return null;
  const left = remainingOf(goal.estimate.turns, spent.turns);
  if (left === null) return null;
  if (left === "over") return "past estimate";
  if (Math.round(left.high) <= 0) return "due now";
  return `~${roundRange(left)} turns left`;
}

export function formatRange(range: Range | null, kind: "turns" | "tokens" | "minutes"): string {
  if (range === null) return "—";
  if (kind === "tokens") {
    return range.low === range.high ? formatTokens(range.low) : `${formatTokens(range.low)}–${formatTokens(range.high)}`;
  }
  return `${roundRange(range)} ${kind === "turns" ? "turns" : "min"}`;
}

export function formatSpent(spent: Spent): string {
  return `${spent.turns} ${spent.turns === 1 ? "turn" : "turns"}, ${formatTokens(spent.tokens)} tokens, ${Math.round(spent.ms / 60_000)} min`;
}

/** The 10th to 90th percentile, matching an 80% estimate; null under five samples. */
export function percentileRange(values: readonly number[]): Range | null {
  if (values.length < 5) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
  };
  return { low: at(0.1), high: at(0.9) };
}

/** One finished piece of work to estimate from: a closed goal, or a whole archived thread. */
export interface HistorySample {
  origin: string | null;
  /** The goal's stage count; null for a whole thread. */
  stages: number | null;
  turns: number;
  tokens: number;
  ms: number;
}

export interface History {
  /** Which samples it read, for the line that prints it. */
  basis: string;
  count: number;
  turns: Range | null;
  tokens: Range | null;
  minutes: Range | null;
}

/**
 * The narrowest group of past work with enough samples: closed goals from the
 * same kind of start with the same number of stages, then closed goals from the
 * same start, then whole archived threads from the same start. Null when
 * none has five.
 */
export function historyFor(
  origin: string | null,
  stages: number,
  goals: readonly HistorySample[],
  threads: readonly HistorySample[],
): History | null {
  const groups: Array<[string, HistorySample[]]> = [
    [`closed goals from ${originLabel(origin)} with ${stages} ${stages === 1 ? "stage" : "stages"}`, goals.filter((g) => g.origin === origin && g.stages === stages)],
    [`closed goals from ${originLabel(origin)}`, goals.filter((g) => g.origin === origin)],
    [`archived ${originLabel(origin)}, whole thread`, threads.filter((t) => t.origin === origin)],
  ];
  for (const [basis, samples] of groups) {
    if (samples.length < 5) continue;
    const minutes = percentileRange(samples.map((s) => s.ms / 60_000));
    return {
      basis,
      count: samples.length,
      turns: percentileRange(samples.map((s) => s.turns)),
      tokens: percentileRange(samples.map((s) => s.tokens)),
      minutes,
    };
  }
  return null;
}

export function formatHistory(history: History | null): string {
  if (history === null) return "No history to compare with yet: fewer than five finished threads started this way.";
  return `${history.basis} (${history.count}): ${formatRange(history.turns, "turns")}, ${formatRange(history.tokens, "tokens")} tokens, ${formatRange(history.minutes, "minutes")}.`;
}

/** Did each estimated quantity land inside its range? Null where there was no estimate. */
export function landed(estimate: GoalEstimate, spent: Spent): { turns: boolean | null; tokens: boolean | null; minutes: boolean | null } {
  const inside = (range: Range | null, value: number) => (range === null ? null : value >= range.low && value <= range.high);
  return {
    turns: inside(estimate.turns, spent.turns),
    tokens: inside(estimate.tokens, spent.tokens),
    minutes: inside(estimate.minutes, spent.ms / 60_000),
  };
}

/** The `goal show` text. */
export function formatGoal(goal: Goal, spent: Spent, history: History | null, revisions: readonly Goal[]): string {
  if (goal.shape === "none") return "This thread has no goal (set with --none).";
  const lines: string[] = [];
  const label = goal.shape === "exploration" ? "Question" : goal.shape === "project" ? "Purpose" : "Goal";
  lines.push(`${label}: ${goal.text}`);
  if (goal.pr !== null) lines.push(`PR: ${goal.pr}`);
  if (goal.stages.length > 0) {
    lines.push("Done is:");
    goal.stages.forEach((stage, index) => lines.push(`  [${index < goal.reached ? "x" : " "}] ${stage}`));
  }
  if (goal.outcome !== null) {
    lines.push(`Outcome: ${OUTCOME_LABELS[goal.outcome]}${goal.outcomeNote ? ` (${goal.outcomeNote})` : ""}`);
  }
  const { turns, tokens, minutes } = goal.estimate;
  if (turns !== null || tokens !== null || minutes !== null) {
    lines.push(`Estimate: ${formatRange(turns, "turns")}, ${formatRange(tokens, "tokens")} tokens, ${formatRange(minutes, "minutes")}`);
  } else {
    lines.push("Estimate: none. Add one with bb tokenomics goal estimate --turns 3-8 --tokens 5M-20M --minutes 20-60.");
  }
  lines.push(`Spent: ${formatSpent(spent)}`);
  const left = remainingLabel(goal, spent);
  if (left !== null) lines.push(`Left: ${left}`);
  lines.push(`History: ${formatHistory(history)}`);
  const earlier = revisions.filter((revision) => revision.id !== goal.id);
  if (earlier.length > 0) {
    lines.push("Earlier goals:");
    for (const revision of earlier) {
      lines.push(`  - ${revision.text}${revision.spentAtEnd ? ` (${formatSpent(revision.spentAtEnd)})` : ""}`);
    }
    if (goal.reason) lines.push(`Revised because: ${goal.reason}`);
  }
  return lines.join("\n");
}

/** The goal section of every thread's instructions. Fixed text, so it never breaks the prompt cache. */
export const GOAL_INSTRUCTIONS = [
  "## Thread goal (Tokenomics)",
  "Each thread records one goal: what the whole thread is for, not its next step. In the response that",
  "holds your first tool call in a thread, record it with `bb tokenomics goal set`, beside your forecast.",
  "- When the prompt states a goal or a \"Done is:\" list, record it as given, with --by spawner.",
  "- Otherwise set it from the user's first prompt, with --by agent, and say in one line what you set",
  "  and that /tokenomics-set-goal changes it. Don't ask the user to confirm it. Ask only when you",
  "  can't tell what finished looks like, inside any other question you need to ask.",
  "- A task gets 1 to 4 stages, 5 at most, each an end state someone could check (\"PR's checks pass\"),",
  "  never a step (\"Fix the test\"). An exploration (--shape exploration) states the question to answer",
  "  or the decision to make, with no stages. A project (--shape project) states its purpose. A",
  "  conversation with nothing to finish gets --none.",
  "- Add an 80% estimate of the whole goal: --turns 3-8 --tokens 5M-20M --minutes 20-90. The command",
  "  prints how past threads that started the same way went; shift or widen yours from it.",
  'Example: bb tokenomics goal set "Export the widget list to CSV from the toolbar" --stage "Export built"',
  '  --stage "Tests pass" --stage "Reloaded in bb" --turns 3-8 --tokens 5M-20M --minutes 20-60 --by agent',
  "Later in the thread, run `bb tokenomics goal stage next` when a stage's end state becomes true, and",
  "`bb tokenomics goal close met|partly|not --note TEXT` when the goal's work is done or dropped. Don't",
  "change the goal yourself: when the user's requests move past it, say so in one line and suggest",
  "/tokenomics-set-goal. `bb tokenomics goal show` prints the goal, what it has used, and the estimate.",
].join("\n");

/** Medians for the outcomes view: one group of threads. */
export interface OutcomeGroup {
  label: string;
  count: number;
  medianTurns: number | null;
  medianTokens: number | null;
  medianMinutes: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function groupOf(label: string, samples: readonly Spent[]): OutcomeGroup {
  return {
    label,
    count: samples.length,
    medianTurns: median(samples.map((s) => s.turns)),
    medianTokens: median(samples.map((s) => s.tokens)),
    medianMinutes: median(samples.map((s) => s.ms / 60_000)),
  };
}

/** Share of closed goals whose estimate held each quantity, over goals that estimated it. */
export function estimateRecord(goals: ReadonlyArray<Pick<Goal, "estimate" | "spentAtEnd" | "outcome">>): {
  turns: { inside: number; of: number };
  tokens: { inside: number; of: number };
  minutes: { inside: number; of: number };
} {
  const record = { turns: { inside: 0, of: 0 }, tokens: { inside: 0, of: 0 }, minutes: { inside: 0, of: 0 } };
  for (const goal of goals) {
    if (goal.outcome === null || goal.spentAtEnd === null) continue;
    const result = landed(goal.estimate, goal.spentAtEnd);
    for (const key of ["turns", "tokens", "minutes"] as const) {
      if (result[key] === null) continue;
      record[key].of += 1;
      if (result[key]) record[key].inside += 1;
    }
  }
  return record;
}
