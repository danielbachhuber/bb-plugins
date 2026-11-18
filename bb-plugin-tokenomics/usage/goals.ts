// Thread goals: what a thread is for, the "Done is" list that shows it is
// done, an estimate of what it will take, and how it ended. Pure functions
// only; the store and the CLI in server.ts do the I/O.
//
// A goal is the higher-level statement of a thread's work, not its next step.
// Its entries are end states someone could check ("PR's checks pass", "H2
// addressed"), never tasks ("Fix the test"). The goal's detail level caps
// them: 5 at low, 25 at high. Past the cap, the agent groups the work and
// keeps a count on an entry ("Medium findings addressed · 2 of 9"), so the
// goal never turns into a to-do list nobody reads.

import { formatTokens } from "./series.js";

export const GOAL_SHAPES = ["task", "exploration", "project", "none"] as const;
export type GoalShape = (typeof GOAL_SHAPES)[number];

export const GOAL_SETTERS = ["spawner", "agent", "you"] as const;
export type GoalSetBy = (typeof GOAL_SETTERS)[number];

export const OUTCOMES = ["met", "partly", "not"] as const;
export type Outcome = (typeof OUTCOMES)[number];

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

/** How much the "Done is" list holds: low groups the work into a few entries, high lists each piece. */
export const GOAL_DETAILS = ["low", "high"] as const;
export type GoalDetail = (typeof GOAL_DETAILS)[number];
/** Entries past this are refused at each level; group the work and count it instead. */
export const MAX_ENTRIES: Record<GoalDetail, number> = { low: 5, high: 25 };
export const MAX_ENTRY_LENGTH = 100;

/**
 * One line of a goal's "Done is" list, each finishing on its own: not
 * started, in progress, done, or dropped. A count says how far a grouped
 * entry has come, such as 2 of 9 medium findings.
 */
export const ENTRY_STATES = ["todo", "current", "done", "dropped"] as const;
export type EntryState = (typeof ENTRY_STATES)[number];
export interface GoalEntry {
  label: string;
  state: EntryState;
  count?: { done: number; total: number };
}

export function isFinished(entry: Pick<GoalEntry, "state">): boolean {
  return entry.state === "done" || entry.state === "dropped";
}

export function finishedCount(entries: readonly Pick<GoalEntry, "state">[]): number {
  return entries.filter(isFinished).length;
}

function isEntry(value: unknown): value is GoalEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as GoalEntry;
  if (typeof entry.label !== "string" || !ENTRY_STATES.includes(entry.state)) return false;
  return entry.count === undefined || (typeof entry.count?.done === "number" && typeof entry.count?.total === "number");
}

/** Reads a JSON list of entries; null when the column is empty or malformed. */
export function parseEntries(text: string | null): GoalEntry[] | null {
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : null;
  } catch {
    return null;
  }
}

/**
 * A goal recorded before the "Done is" list, as one: its items, then its
 * stages, the first `reached` of them done. Kept so older goals still show.
 */
export function legacyEntries(stages: readonly string[], reached: number, items: readonly GoalEntry[]): GoalEntry[] {
  return [...items, ...stages.map((label, index) => ({ label, state: (index < reached ? "done" : "todo") as EntryState }))];
}

/** Trims entry labels; returns an error to print, or the labels. */
export function checkLabels(raw: readonly string[]): { labels: string[] } | { error: string } {
  const labels = raw.map((label) => label.trim().replace(/\s+/g, " ")).filter((label) => label !== "");
  const long = labels.find((label) => label.length > MAX_ENTRY_LENGTH);
  if (long !== undefined) return { error: `Keep each entry under ${MAX_ENTRY_LENGTH} characters: "${long.slice(0, 40)}…"` };
  return { labels };
}

/** The error for a list past the level's cap, or null when it fits. */
export function overCap(count: number, detail: GoalDetail): string | null {
  const max = MAX_ENTRIES[detail];
  if (count <= max) return null;
  return detail === "low"
    ? `${count} entries is too many at low detail; ${max} at most. Group the work by what the pieces share and keep a count on each group (goal entry count N DONE/TOTAL), or use --detail high for up to ${MAX_ENTRIES.high}.`
    : `${count} entries is too many; ${max} at most. Keep the pieces that matter most as their own entries and group the rest with a count (goal entry count N DONE/TOTAL).`;
}

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
  /** The "Done is" list. */
  entries: GoalEntry[];
  detail: GoalDetail;
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

/** Checks the "Done is" list for the shape and level; returns an error to print, or the labels. */
export function checkStages(shape: GoalShape, raw: readonly string[], detail: GoalDetail = "low"): { stages: string[] } | { error: string } {
  const checked = checkLabels(raw);
  if ("error" in checked) return checked;
  const stages = checked.labels;
  if (shape === "task" && stages.length === 0) {
    return {
      error:
        'A task goal needs its "Done is" entries: --stage "Export built" --stage "Tests pass". Use --shape exploration for a question, or --none for no goal.',
    };
  }
  if (shape === "exploration") {
    // Fixed, so every exploration fills its donut the same way: the answer, then the user's call.
    if (stages.length > 0) return { error: "An exploration's entries are fixed: Answer recommended, then You decided. Leave out --stage." };
    return { stages: [...EXPLORATION_STAGES] };
  }
  if (shape !== "task" && stages.length > 0) {
    return { error: `An ${shape} goal has no entries. Leave out --stage, or use --shape task.` };
  }
  const over = overCap(stages.length, detail);
  if (over !== null) return { error: over };
  return { stages };
}

/** An exploration's stages: the agent's recommended answer, then the user's decision. */
export const EXPLORATION_STAGES = ["Answer recommended", "You decided"] as const;

export const OUTCOME_LABELS: Record<Outcome, string> = { met: "Met", partly: "Partly met", not: "Not met" };

/**
 * The short status the token button and the sidebar show: "1 of 3 · Tests
 * pass" (the entry in progress, if one is), "Exploring", "Met". Null for a
 * thread with no goal to show.
 */
export function stageLabel(goal: Pick<Goal, "shape" | "entries" | "outcome">): string | null {
  if (goal.shape === "none") return null;
  if (goal.outcome !== null) return OUTCOME_LABELS[goal.outcome];
  if (goal.shape === "exploration" && goal.entries.length === 0) return "Exploring";
  if (goal.shape === "project") return "Project";
  const count = `${finishedCount(goal.entries)} of ${goal.entries.length}`;
  const current = goal.entries.find((entry) => entry.state === "current");
  return current === undefined ? count : `${count} · ${current.label}`;
}

/** An entry's line in goal show: "3. [>] Medium findings addressed (2 of 9)". */
export function entryLine(entry: GoalEntry, index: number): string {
  const mark = { todo: " ", current: ">", done: "x", dropped: "-" } as const;
  return `  ${index + 1}. [${mark[entry.state]}] ${entry.label}${entry.count ? ` (${entry.count.done} of ${entry.count.total})` : ""}`;
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

/** The goal's turns left: "~2–5 turns left", "past estimate", or null with no turn estimate or once closed. */
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
  /** The goal's entry count; null for a whole thread. */
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
    [`closed goals from ${originLabel(origin)} with ${stages} ${stages === 1 ? "entry" : "entries"}`, goals.filter((g) => g.origin === origin && g.stages === stages)],
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
  if (goal.entries.length > 0) {
    lines.push(`Done is (${finishedCount(goal.entries)} of ${goal.entries.length}, ${goal.detail} detail, ${MAX_ENTRIES[goal.detail]} at most):`);
    goal.entries.forEach((entry, index) => lines.push(entryLine(entry, index)));
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
  "  and that /tokenomics-update-goal changes it. Don't ask the user to confirm it. Ask only when you",
  "  can't tell what finished looks like, inside any other question you need to ask.",
  "- A task gets a \"Done is\" list of end states someone could check (\"PR's checks pass\"), never steps",
  "  (\"Fix the test\"): 1 to 5 entries at the default --detail low. An exploration (--shape exploration)",
  "  states the question to answer or the decision to make; its entries are fixed, Answer recommended then",
  "  You decided, so run `goal stage next` once you've recommended an answer. A project (--shape project)",
  "  states its purpose. A conversation with nothing to finish gets --none.",
  "- The last entry is what ends the thread, such as \"PR open with checks passing\" or \"Merged\", never",
  "  a step on the way, such as \"PR description drafted\". When work goes on after every entry is done,",
  "  add the entry that ends it: `bb tokenomics goal entry add \"PR open with checks passing\"`.",
  "- When the user will look at what you make, such as a design, a UI, or a draft, the last entry is",
  "  their acceptance (\"Refined on your feedback\"), not \"Built\". Their review is part of the work.",
  "- When the work is many similar pieces, such as a review's findings, group them by what they share",
  "  and keep a count on each group: `goal entry count 2 4/9` for \"Medium findings addressed\". The",
  "  user can ask for --detail high, up to 25 entries, to list each piece. Mark entries as you go with",
  "  `goal entry start|done|drop N`.",
  "- Add an 80% estimate of the whole goal: --turns 3-8 --tokens 5M-20M --minutes 20-90. The command",
  "  prints how past threads that started the same way went; shift or widen yours from it.",
  'Example: bb tokenomics goal set "Export the widget list to CSV from the toolbar" --stage "Export built"',
  '  --stage "Tests pass" --stage "Refined on your feedback" --turns 3-8 --tokens 5M-20M --minutes 20-60 --by agent',
  "Later in the thread, run `bb tokenomics goal stage next` when the next entry becomes true, and",
  "`bb tokenomics goal close met|partly|not --note TEXT` when the goal's work is done or dropped: for",
  "  work the user reviews, only once they've accepted it. When feedback arrives after you closed it, run",
  "  `bb tokenomics goal reopen --stage \"Refined on your feedback\"` and keep going. Don't",
  "change the goal yourself: when the user's requests move past it, say so in one line and suggest",
  "/tokenomics-update-goal, which updates it. When you write the prompt for a thread you start, end it with a `Goal:` line and",
  "a `Done is:` list under the same rules, so that thread records it. `bb tokenomics goal show` prints",
  "the goal, what it has used, and the estimate.",
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
