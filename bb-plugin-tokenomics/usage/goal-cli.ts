// `bb tokenomics goal ...`: records, moves, estimates, closes, and shows a
// thread's goal. Takes its database and clock as arguments, so the tests run
// it against an in-memory database.
import type { GoalStore } from "./goal-store.js";
import {
  checkLabels,
  checkStages,
  ENTRY_STATES,
  finishedCount,
  formatGoal,
  formatHistory,
  formatRange,
  formatSpent,
  GOAL_DETAILS,
  GOAL_SETTERS,
  GOAL_SHAPES,
  historyFor,
  isFinished,
  landed,
  MAX_ENTRIES,
  overCap,
  NO_ESTIMATE,
  OUTCOMES,
  OUTCOME_LABELS,
  parseGoalRange,
  remainingLabel,
  stageLabel,
  type Goal,
  type GoalDetail,
  type GoalEntry,
  type GoalEstimate,
  type GoalSetBy,
  type GoalShape,
  type History,
  type Outcome,
  type Range,
  type Spent,
} from "./goals.js";

export interface GoalDeps {
  goals: GoalStore;
  now(): number;
  /** Where history for estimates starts. */
  historySince(): number;
  originOf(threadId: string): Promise<string | null>;
  /** Called after a thread's goal changes, so the header and sidebar re-read. */
  changed(threadId: string): void;
}

interface CliResult {
  exitCode: number;
  stdout?: string;
  stderr?: string;
}

export const GOAL_USAGE = [
  'bb tokenomics goal set "GOAL" --stage "END STATE" ... [--detail low|high] [--shape task|exploration|project]',
  "    [--none] [--turns LOW-HIGH] [--tokens LOW-HIGH] [--minutes LOW-HIGH] [--pr URL] [--by spawner|agent|you]",
  "    [--reason TEXT]",
  '  Records this thread\'s goal: its "Done is" list, each entry an end state, up to 5 at --detail low (the',
  "  default) or 25 at high, and an 80% estimate of the whole goal. Prints how past threads that started",
  "  the same way went. A thread with an open goal needs --reason to replace it, or use goal refine;",
  "  /tokenomics-update-goal does that.",
  "bb tokenomics goal stage next|N",
  "  Marks the next unfinished entry done, or the first N entries.",
  'bb tokenomics goal entry add "END STATE" ...',
  "  Adds entries at the end of the list, such as the one that ends the thread.",
  "bb tokenomics goal entry start|done|drop|todo N ...",
  "  Marks entries by number (from goal show): in progress, done, dropped, or not started.",
  "bb tokenomics goal entry count N DONE/TOTAL",
  "  Keeps a count on a grouped entry, such as 2/9 for \"Medium findings addressed\". At DONE = TOTAL it is done.",
  "bb tokenomics goal estimate [--turns LOW-HIGH] [--tokens LOW-HIGH] [--minutes LOW-HIGH]",
  "  Replaces the goal's estimate.",
  "bb tokenomics goal close met|partly|not [--note TEXT]",
  "  Records how the goal ended, with what it used.",
  'bb tokenomics goal refine ["GOAL"] [--stage "END STATE" ...] [--detail low|high] [--reached N] [--turns ...]',
  '    [--tokens ...] [--minutes ...] --reason TEXT',
  "  Rewrites the open goal to match what the thread is doing, and keeps the old one in the history. Leave",
  "  out what doesn't change. Entries kept word for word keep their state and count; --reached N marks the",
  "  first N of the new list done instead. /tokenomics-update-goal does this.",
  "bb tokenomics goal clear [--reason TEXT]",
  "  Takes the goal off this thread, leaving no goal. The goal and what it used stay in the history.",
  "  /tokenomics-clear-goal does this.",
  'bb tokenomics goal reopen [--stage "END STATE"] ...',
  "  Opens a closed goal again, such as when feedback arrives after it was closed, adding any entries.",
  "bb tokenomics goal show [--json]",
  "  Prints the goal, its list, its estimate, what it has used, and earlier goals.",
].join("\n");

const BOOLEAN_FLAGS = new Set(["--none", "--json"]);

/** Splits arguments into positionals and flags; a repeated flag keeps every value. */
export function parseArgs(argv: readonly string[]): { positionals: string[]; flags: Map<string, string[]>; booleans: Set<string> } {
  const positionals: string[] = [];
  const flags = new Map<string, string[]>();
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (BOOLEAN_FLAGS.has(arg)) {
      booleans.add(arg);
    } else if (arg.startsWith("--")) {
      const [name, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
      const value = inline ?? argv[index + 1];
      if (inline === undefined) index += 1;
      if (value !== undefined) flags.set(name, [...(flags.get(name) ?? []), value]);
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags, booleans };
}

function readEstimate(flags: Map<string, string[]>): GoalEstimate | { error: string } {
  const estimate: GoalEstimate = { ...NO_ESTIMATE };
  for (const key of ["turns", "tokens", "minutes"] as const) {
    const text = flags.get(`--${key}`)?.at(-1);
    if (text === undefined) continue;
    const range = parseGoalRange(text);
    if (range === null) {
      const example = key === "tokens" ? "5M-20M" : key === "turns" ? "3-8" : "20-60";
      return { error: `Give --${key} as a range, such as --${key} ${example}.` };
    }
    estimate[key] = range;
  }
  return estimate;
}

function overlaps(a: Range | null, b: Range | null): boolean {
  return a === null || b === null || (a.low <= b.high && b.low <= a.high);
}

/** A line comparing the estimate with history, when they don't overlap. */
function compareLine(estimate: GoalEstimate, history: History | null): string | null {
  if (history === null) return null;
  const off = (["turns", "tokens", "minutes"] as const).filter((key) => !overlaps(estimate[key], history[key]));
  if (off.length === 0) return null;
  return `Your ${off.join(" and ")} range doesn't overlap that history. Check it, or say in the thread why this goal differs.`;
}

function readDetail(flags: Map<string, string[]>, fallback: GoalDetail): GoalDetail | { error: string } {
  const text = flags.get("--detail")?.at(-1);
  if (text === undefined) return fallback;
  return GOAL_DETAILS.includes(text as GoalDetail) ? (text as GoalDetail) : { error: "--detail takes low or high." };
}

const todo = (label: string): GoalEntry => ({ label, state: "todo" });

/** The goal as the header line, the sidebar, and `goal show --json` read it. */
export function goalView(deps: GoalDeps, goal: Goal) {
  const spent = deps.goals.spentOn(goal, deps.now());
  return {
    id: goal.id,
    shape: goal.shape,
    text: goal.text,
    entries: goal.entries,
    detail: goal.detail,
    pr: goal.pr,
    setBy: goal.setBy,
    setAt: goal.setAt,
    reason: goal.reason,
    outcome: goal.outcome,
    outcomeNote: goal.outcomeNote,
    estimate: goal.estimate,
    spent,
    label: stageLabel(goal),
    left: remainingLabel(goal, spent),
    revisions: deps.goals.history(goal.threadId).length - 1,
  };
}

export type GoalView = ReturnType<typeof goalView>;

async function historyOf(deps: GoalDeps, origin: string | null, stages: number): Promise<History | null> {
  const { goals, threads } = deps.goals.historySamples(deps.historySince());
  return historyFor(origin, stages, goals, threads);
}

async function set(deps: GoalDeps, threadId: string, argv: readonly string[]): Promise<CliResult> {
  const { positionals, flags, booleans } = parseArgs(argv);
  const none = booleans.has("--none");
  const shape = (none ? "none" : (flags.get("--shape")?.at(-1) ?? "task")) as GoalShape;
  if (!GOAL_SHAPES.includes(shape)) return { exitCode: 1, stderr: "--shape takes task, exploration, or project." };
  const text = positionals.join(" ").trim();
  if (shape !== "none" && text === "") {
    return { exitCode: 1, stderr: 'Give the goal in quotes: bb tokenomics goal set "PR #12 merged" --stage "Checks pass" ...' };
  }
  if (text.length > 200) return { exitCode: 1, stderr: "Keep the goal under 200 characters; the entries carry the detail." };
  const detail = readDetail(flags, "low");
  if (typeof detail === "object") return { exitCode: 1, stderr: detail.error };
  const checked = checkStages(shape, flags.get("--stage") ?? [], detail);
  if ("error" in checked) return { exitCode: 1, stderr: checked.error };
  const setBy = (flags.get("--by")?.at(-1) ?? "agent") as GoalSetBy;
  if (!GOAL_SETTERS.includes(setBy)) return { exitCode: 1, stderr: "--by takes spawner, agent, or you." };
  const estimate = readEstimate(flags);
  if ("error" in estimate) return { exitCode: 1, stderr: estimate.error };
  const reason = flags.get("--reason")?.at(-1)?.trim() || null;

  const now = deps.now();
  const current = deps.goals.current(threadId);
  const open = current !== null && current.outcome === null && current.shape !== "none";
  if (open && reason === null) {
    return {
      exitCode: 1,
      stderr: `This thread already has a goal: "${current.text}". Leave it, update it with bb tokenomics goal refine --reason, or run /tokenomics-update-goal.`,
    };
  }
  const origin = await deps.originOf(threadId);
  // The thread's first goal counts the whole turn it was set in. A revision
  // starts counting at the revision, so what came before stays with the old goal.
  const anchorAt = current === null ? (deps.goals.turnStartAt(threadId, now) ?? now) : now;
  const previous = current === null ? null : { id: current.id, spent: deps.goals.spentOn(current, now) };
  const goal = deps.goals.set(
    {
      threadId,
      setAt: now,
      anchorAt,
      shape,
      text: shape === "none" ? "" : text,
      entries: checked.stages.map(todo),
      detail,
      pr: flags.get("--pr")?.at(-1) ?? null,
      setBy,
      reason: current === null ? null : reason,
      origin,
      estimate,
    },
    previous,
  );
  deps.changed(threadId);
  if (shape === "none") return { exitCode: 0, stdout: "Recorded: this thread has no goal." };

  const history = await historyOf(deps, origin, goal.entries.length);
  const lines = [
    `Recorded${current === null ? "" : ", replacing the earlier goal"}: ${goal.text}${goal.entries.length > 0 ? ` (${goal.entries.length} ${goal.entries.length === 1 ? "entry" : "entries"}, ${goal.detail} detail)` : ""}.`,
  ];
  const { turns, tokens, minutes } = goal.estimate;
  if (turns === null && tokens === null && minutes === null) {
    lines.push("No estimate. Add one with bb tokenomics goal estimate --turns 3-8 --tokens 5M-20M --minutes 20-60.");
  } else {
    lines.push(`Estimate: ${formatRange(turns, "turns")}, ${formatRange(tokens, "tokens")} tokens, ${formatRange(minutes, "minutes")}.`);
  }
  lines.push(`History: ${formatHistory(history)}`);
  const compare = compareLine(goal.estimate, history);
  if (compare !== null) lines.push(compare);
  return { exitCode: 0, stdout: lines.join("\n") };
}

function openGoal(deps: GoalDeps, threadId: string): Goal | CliResult {
  const goal = deps.goals.current(threadId);
  if (goal === null || goal.shape === "none") {
    return { exitCode: 1, stderr: 'This thread has no goal. Record one with bb tokenomics goal set "GOAL" --stage "END STATE".' };
  }
  return goal;
}

function stage(deps: GoalDeps, threadId: string, argv: readonly string[]): CliResult {
  const found = openGoal(deps, threadId);
  if ("exitCode" in found) return found;
  const goal = found;
  if (goal.entries.length === 0) return { exitCode: 1, stderr: `An ${goal.shape} goal has no entries. Close it when it's done.` };
  const [which] = parseArgs(argv).positionals;
  let entries: GoalEntry[];
  if (which === "next") {
    const next = goal.entries.findIndex((entry) => !isFinished(entry));
    if (next < 0) return { exitCode: 1, stderr: "Every entry is already done or dropped." };
    entries = goal.entries.map((entry, index) => (index === next ? { ...entry, state: "done" } : entry));
  } else {
    const count = Number(which);
    if (!Number.isInteger(count) || count < 0 || count > goal.entries.length) {
      return { exitCode: 1, stderr: `Give next, or a number from 0 to ${goal.entries.length}.` };
    }
    entries = goal.entries.map((entry, index) =>
      index < count ? (entry.state === "dropped" ? entry : { ...entry, state: "done" }) : isFinished(entry) ? { ...entry, state: "todo" } : entry,
    );
  }
  deps.goals.setEntries(goal.id, entries);
  deps.changed(threadId);
  return { exitCode: 0, stdout: `Done is: ${stageLabel({ ...goal, entries }) ?? ""}.${allDone(entries)}` };
}

function allDone(entries: readonly GoalEntry[]): string {
  return entries.every(isFinished)
    ? ' Every entry is done. Close the goal with bb tokenomics goal close met once the thread\'s work is finished, or add the entry that ends it with bb tokenomics goal entry add "END STATE".'
    : "";
}

function estimate(deps: GoalDeps, threadId: string, argv: readonly string[]): CliResult {
  const found = openGoal(deps, threadId);
  if ("exitCode" in found) return found;
  const next = readEstimate(parseArgs(argv).flags);
  if ("error" in next) return { exitCode: 1, stderr: next.error };
  if (next.turns === null && next.tokens === null && next.minutes === null) {
    return { exitCode: 1, stderr: "Give at least one of --turns, --tokens, or --minutes." };
  }
  const merged: GoalEstimate = {
    turns: next.turns ?? found.estimate.turns,
    tokens: next.tokens ?? found.estimate.tokens,
    minutes: next.minutes ?? found.estimate.minutes,
  };
  deps.goals.setEstimate(found.id, merged);
  deps.changed(threadId);
  const spent = deps.goals.spentOn(found, deps.now());
  return {
    exitCode: 0,
    stdout: `Estimate: ${formatRange(merged.turns, "turns")}, ${formatRange(merged.tokens, "tokens")} tokens, ${formatRange(merged.minutes, "minutes")}. Spent so far: ${formatSpent(spent)}.`,
  };
}

function close(deps: GoalDeps, threadId: string, argv: readonly string[]): CliResult {
  const found = openGoal(deps, threadId);
  if ("exitCode" in found) return found;
  const { positionals, flags } = parseArgs(argv);
  const outcome = positionals[0] as Outcome | undefined;
  if (outcome === undefined || !OUTCOMES.includes(outcome)) return { exitCode: 1, stderr: "Give the outcome: met, partly, or not." };
  const now = deps.now();
  const spent: Spent = deps.goals.spent(threadId, found.anchorAt, now + 1);
  const note = flags.get("--note")?.at(-1)?.trim().slice(0, 300) || null;
  deps.goals.close(found.id, outcome, note, now, spent, found.entries);
  deps.changed(threadId);
  const result = landed(found.estimate, spent);
  const marks = (["turns", "tokens", "minutes"] as const)
    .filter((key) => result[key] !== null)
    .map((key) => `${key} ${result[key] ? "inside" : "outside"}`);
  return {
    exitCode: 0,
    stdout: `Closed: ${OUTCOME_LABELS[outcome]}. Used ${formatSpent(spent)} so far. The goal keeps counting this thread's turns, including any feedback, until another goal is set.${marks.length > 0 ? ` Estimate so far: ${marks.join(", ")}.` : ""}`,
  };
}

function reopen(deps: GoalDeps, threadId: string, argv: readonly string[]): CliResult {
  const goal = deps.goals.current(threadId);
  if (goal === null || goal.shape === "none") return { exitCode: 1, stderr: "This thread has no goal to reopen." };
  if (goal.outcome === null) return { exitCode: 1, stderr: "The goal is still open." };
  const checked = checkLabels(parseArgs(argv).flags.get("--stage") ?? []);
  if ("error" in checked) return { exitCode: 1, stderr: checked.error };
  const entries = [...goal.entries, ...checked.labels.map(todo)];
  const over = overCap(entries.length, goal.detail);
  if (over !== null) return { exitCode: 1, stderr: over };
  deps.goals.reopen(goal.id, entries);
  deps.changed(threadId);
  const label = stageLabel({ ...goal, entries, outcome: null }) ?? "open";
  return { exitCode: 0, stdout: `Reopened: ${goal.text} (${label}).` };
}

/**
 * The new list's entries, each keeping the state and count of an old entry
 * with the same wording. With `reached`, the first that many are done instead
 * and the rest start over.
 */
export function carriedEntries(previous: readonly GoalEntry[], labels: readonly string[], reached: number | null): GoalEntry[] {
  if (reached !== null) return labels.map((label, index) => ({ label, state: index < reached ? "done" : "todo" }));
  const byLabel = new Map(previous.map((entry) => [entry.label.trim().toLowerCase(), entry]));
  return labels.map((label) => {
    const kept = byLabel.get(label.trim().toLowerCase());
    return kept === undefined ? todo(label) : { ...kept, label };
  });
}

async function refine(deps: GoalDeps, threadId: string, argv: readonly string[]): Promise<CliResult> {
  const found = openGoal(deps, threadId);
  if ("exitCode" in found) return found;
  if (found.outcome !== null) return { exitCode: 1, stderr: 'The goal is closed. Reopen it first with bb tokenomics goal reopen, or set a new one.' };
  const { positionals, flags } = parseArgs(argv);
  const reason = flags.get("--reason")?.at(-1)?.trim() || null;
  if (reason === null) return { exitCode: 1, stderr: 'Say what changed with --reason, such as --reason "The work grew from one option to three".' };
  const text = positionals.join(" ").trim() || found.text;
  if (text.length > 200) return { exitCode: 1, stderr: "Keep the goal under 200 characters; the entries carry the detail." };
  const detail = readDetail(flags, found.detail);
  if (typeof detail === "object") return { exitCode: 1, stderr: detail.error };
  const given = flags.get("--stage");
  const checked = given === undefined ? { stages: found.entries.map((entry) => entry.label) } : checkStages(found.shape, given, detail);
  if ("error" in checked) return { exitCode: 1, stderr: checked.error };
  const over = overCap(checked.stages.length, detail);
  if (over !== null) return { exitCode: 1, stderr: over };
  const next = readEstimate(flags);
  if ("error" in next) return { exitCode: 1, stderr: next.error };
  const estimate: GoalEstimate = {
    turns: next.turns ?? found.estimate.turns,
    tokens: next.tokens ?? found.estimate.tokens,
    minutes: next.minutes ?? found.estimate.minutes,
  };
  const reachedText = flags.get("--reached")?.at(-1);
  const reached = reachedText === undefined ? null : Number(reachedText);
  if (reached !== null && (!Number.isInteger(reached) || reached < 0 || reached > checked.stages.length)) {
    return { exitCode: 1, stderr: `Give --reached as a number from 0 to ${checked.stages.length}.` };
  }
  const entries = carriedEntries(found.entries, checked.stages, reached);
  const now = deps.now();
  const goal = deps.goals.set(
    {
      threadId,
      setAt: now,
      anchorAt: now,
      shape: found.shape,
      text,
      entries,
      detail,
      pr: flags.get("--pr")?.at(-1) ?? found.pr,
      setBy: (flags.get("--by")?.at(-1) as GoalSetBy | undefined) ?? "agent",
      reason,
      origin: found.origin,
      estimate,
    },
    { id: found.id, spent: deps.goals.spentOn(found, now) },
  );
  deps.changed(threadId);
  const label = stageLabel(goal) ?? "";
  return { exitCode: 0, stdout: `Refined: ${text} (${label}). The earlier goal stays in the history with what it used.` };
}

const ENTRY_VERBS: Record<string, GoalEntry["state"]> = { start: "current", done: "done", drop: "dropped", todo: "todo" };

function entry(deps: GoalDeps, threadId: string, argv: readonly string[]): CliResult {
  const found = openGoal(deps, threadId);
  if ("exitCode" in found) return found;
  const [verb, ...rest] = parseArgs(argv).positionals;
  const numbersOf = (parts: readonly string[]) => parts.flatMap((part) => part.split(",")).filter((part) => part !== "").map(Number);
  const badNumbers = (numbers: readonly number[]) =>
    numbers.length === 0 || numbers.some((n) => !Number.isInteger(n) || n < 1 || n > found.entries.length);
  const numberError = { exitCode: 1, stderr: found.entries.length === 0 ? "The goal has no entries yet. Add them with bb tokenomics goal entry add." : `Give entry numbers from 1 to ${found.entries.length}.` };
  let entries: GoalEntry[];
  if (verb === "add") {
    const checked = checkLabels(rest);
    if ("error" in checked) return { exitCode: 1, stderr: checked.error };
    if (checked.labels.length === 0) return { exitCode: 1, stderr: 'Give each entry in quotes: bb tokenomics goal entry add "PR open with checks passing".' };
    entries = [...found.entries, ...checked.labels.map(todo)];
    const over = overCap(entries.length, found.detail);
    if (over !== null) return { exitCode: 1, stderr: over };
  } else if (verb === "count") {
    const [which, ratio] = rest;
    const index = Number(which) - 1;
    if (badNumbers([index + 1])) return numberError;
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(ratio ?? "");
    const done = Number(match?.[1]);
    const total = Number(match?.[2]);
    if (match === null || total < 1 || done > total) return { exitCode: 1, stderr: "Give the count as DONE/TOTAL, such as 2/9." };
    entries = found.entries.map((entry, at) => {
      if (at !== index) return entry;
      const state = done === total ? "done" : done > 0 ? "current" : entry.state === "dropped" ? "dropped" : entry.state;
      return { ...entry, state, count: { done, total } };
    });
  } else if (verb !== undefined && verb in ENTRY_VERBS) {
    const numbers = numbersOf(rest);
    if (badNumbers(numbers)) return numberError;
    const state = ENTRY_VERBS[verb]!;
    entries = found.entries.map((entry, index) => (numbers.includes(index + 1) ? { ...entry, state } : entry));
  } else {
    return { exitCode: 1, stderr: `Give add, count, ${Object.keys(ENTRY_VERBS).join(", ")}. States: ${ENTRY_STATES.join(", ")}.` };
  }
  deps.goals.setEntries(found.id, entries);
  deps.changed(threadId);
  const open = entries.filter((each) => !isFinished(each)).length;
  return {
    exitCode: 0,
    stdout: `Done is: ${finishedCount(entries)} of ${entries.length} finished${open > 0 ? `, ${open} open` : ""} (${found.detail} detail, ${MAX_ENTRIES[found.detail]} at most).${allDone(entries)}`,
  };
}

async function show(deps: GoalDeps, threadId: string, argv: readonly string[]): Promise<CliResult> {
  const goal = deps.goals.current(threadId);
  const json = parseArgs(argv).booleans.has("--json");
  if (goal === null) {
    return json ? { exitCode: 0, stdout: "null" } : { exitCode: 0, stdout: "This thread has no goal yet." };
  }
  if (json) return { exitCode: 0, stdout: JSON.stringify(goalView(deps, goal), null, 2) };
  const history = goal.shape === "none" ? null : await historyOf(deps, goal.origin, goal.entries.length);
  return { exitCode: 0, stdout: formatGoal(goal, deps.goals.spentOn(goal, deps.now()), history, deps.goals.history(threadId)) };
}

/** Takes the goal off the thread: records "no goal" in its place, which keeps the old one in the history. */
async function clear(deps: GoalDeps, threadId: string, argv: readonly string[]): Promise<CliResult> {
  const current = deps.goals.current(threadId);
  if (current === null || current.shape === "none") return { exitCode: 0, stdout: "This thread has no goal." };
  const { flags } = parseArgs(argv);
  const reason = flags.get("--reason")?.at(-1)?.trim() || "Cleared by you";
  const result = await set(deps, threadId, ["--none", "--by", "you", "--reason", reason]);
  return result.exitCode === 0 ? { exitCode: 0, stdout: `Cleared the goal "${current.text}". This thread has no goal now.` } : result;
}

export async function goalCli(deps: GoalDeps, threadId: string | undefined, argv: readonly string[]): Promise<CliResult> {
  const [sub, ...rest] = argv;
  if (sub === undefined || sub === "help") return { exitCode: 0, stdout: GOAL_USAGE };
  if (threadId === undefined) return { exitCode: 1, stderr: "Run bb tokenomics goal from inside a bb thread." };
  if (sub === "set") return await set(deps, threadId, rest);
  if (sub === "stage") return stage(deps, threadId, rest);
  if (sub === "estimate") return estimate(deps, threadId, rest);
  if (sub === "close") return close(deps, threadId, rest);
  if (sub === "reopen") return reopen(deps, threadId, rest);
  if (sub === "clear") return await clear(deps, threadId, rest);
  // add-stage and item are the names from before the "Done is" list.
  if (sub === "add-stage") return entry(deps, threadId, ["add", ...rest]);
  if (sub === "entry" || sub === "item") return entry(deps, threadId, rest);
  if (sub === "refine") return await refine(deps, threadId, rest);
  if (sub === "show") return await show(deps, threadId, rest);
  return { exitCode: 1, stderr: `Unknown goal command "${sub}".\n\n${GOAL_USAGE}` };
}
