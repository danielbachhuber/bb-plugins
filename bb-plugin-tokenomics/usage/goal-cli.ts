// `bb tokenomics goal ...`: records, moves, estimates, closes, and shows a
// thread's goal. Takes its database and clock as arguments, so the tests run
// it against an in-memory database.
import type { GoalStore } from "./goal-store.js";
import {
  checkStages,
  formatGoal,
  formatHistory,
  formatRange,
  formatSpent,
  GOAL_SETTERS,
  GOAL_SHAPES,
  historyFor,
  landed,
  NO_ESTIMATE,
  OUTCOMES,
  OUTCOME_LABELS,
  parseGoalRange,
  remainingLabel,
  stageLabel,
  type Goal,
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
  'bb tokenomics goal set "GOAL" --stage "END STATE" ... [--shape task|exploration|project] [--none]',
  "    [--turns LOW-HIGH] [--tokens LOW-HIGH] [--minutes LOW-HIGH] [--pr URL] [--by spawner|agent|you]",
  "    [--reason TEXT]",
  "  Records this thread's goal: up to 5 stages, each an end state, and an 80% estimate of the whole",
  "  goal. Prints how past threads that started the same way went. A thread with an open goal needs",
  "  --reason to replace it; /tokenomics-set-goal does that.",
  "bb tokenomics goal stage next|N",
  "  Marks the next stage, or the first N stages, as done.",
  "bb tokenomics goal estimate [--turns LOW-HIGH] [--tokens LOW-HIGH] [--minutes LOW-HIGH]",
  "  Replaces the goal's estimate.",
  "bb tokenomics goal close met|partly|not [--note TEXT]",
  "  Records how the goal ended, with what it used.",
  'bb tokenomics goal reopen [--stage "END STATE"] ...',
  "  Opens a closed goal again, such as when feedback arrives after it was closed, adding any stages.",
  "bb tokenomics goal show [--json]",
  "  Prints the goal, its stages, its estimate, what it has used, and earlier goals.",
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

/** The goal as the header line, the sidebar, and `goal show --json` read it. */
export function goalView(deps: GoalDeps, goal: Goal) {
  const spent = deps.goals.spentOn(goal, deps.now());
  return {
    id: goal.id,
    shape: goal.shape,
    text: goal.text,
    stages: goal.stages,
    reached: goal.reached,
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
  if (text.length > 200) return { exitCode: 1, stderr: "Keep the goal under 200 characters; the stages carry the detail." };
  const checked = checkStages(shape, flags.get("--stage") ?? []);
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
      stderr: `This thread already has a goal: "${current.text}". Leave it, or revise it through /tokenomics-set-goal, which passes --reason.`,
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
      stages: checked.stages,
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

  const history = await historyOf(deps, origin, goal.stages.length);
  const lines = [`Recorded${current === null ? "" : ", replacing the earlier goal"}: ${goal.text}${goal.stages.length > 0 ? ` (${goal.stages.length} stages)` : ""}.`];
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
  if (goal.stages.length === 0) return { exitCode: 1, stderr: `An ${goal.shape} goal has no stages. Close it when it's done.` };
  const [which] = parseArgs(argv).positionals;
  const reached = which === "next" ? goal.reached + 1 : Number(which);
  if (!Number.isInteger(reached) || reached < 0 || reached > goal.stages.length) {
    return { exitCode: 1, stderr: `Give next, or a number from 0 to ${goal.stages.length}.` };
  }
  deps.goals.setReached(goal.id, reached);
  deps.changed(threadId);
  const label = stageLabel({ ...goal, reached }) ?? "";
  const done = reached === goal.stages.length ? " Every stage is done; close the goal with bb tokenomics goal close met when its work is finished." : "";
  return { exitCode: 0, stdout: `Stage: ${label}.${done}` };
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
  deps.goals.close(found.id, outcome, note, now, spent);
  deps.changed(threadId);
  const result = landed(found.estimate, spent);
  const marks = (["turns", "tokens", "minutes"] as const)
    .filter((key) => result[key] !== null)
    .map((key) => `${key} ${result[key] ? "inside" : "outside"}`);
  return {
    exitCode: 0,
    stdout: `Closed: ${OUTCOME_LABELS[outcome]}. Used ${formatSpent(spent)} before this turn's usage, which Tokenomics adds when the turn ends.${marks.length > 0 ? ` Estimate so far: ${marks.join(", ")}.` : ""}`,
  };
}

function reopen(deps: GoalDeps, threadId: string, argv: readonly string[]): CliResult {
  const goal = deps.goals.current(threadId);
  if (goal === null || goal.shape === "none") return { exitCode: 1, stderr: "This thread has no goal to reopen." };
  if (goal.outcome === null) return { exitCode: 1, stderr: "The goal is still open." };
  const added = parseArgs(argv).flags.get("--stage") ?? [];
  const checked = checkStages(goal.shape, [...goal.stages, ...added]);
  if ("error" in checked) return { exitCode: 1, stderr: checked.error };
  deps.goals.reopen(goal.id, checked.stages);
  deps.changed(threadId);
  const label = stageLabel({ ...goal, stages: checked.stages, outcome: null }) ?? "open";
  return { exitCode: 0, stdout: `Reopened: ${goal.text} (${label}).` };
}

async function show(deps: GoalDeps, threadId: string, argv: readonly string[]): Promise<CliResult> {
  const goal = deps.goals.current(threadId);
  const json = parseArgs(argv).booleans.has("--json");
  if (goal === null) {
    return json ? { exitCode: 0, stdout: "null" } : { exitCode: 0, stdout: "This thread has no goal yet." };
  }
  if (json) return { exitCode: 0, stdout: JSON.stringify(goalView(deps, goal), null, 2) };
  const history = goal.shape === "none" ? null : await historyOf(deps, goal.origin, goal.stages.length);
  return { exitCode: 0, stdout: formatGoal(goal, deps.goals.spentOn(goal, deps.now()), history, deps.goals.history(threadId)) };
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
  if (sub === "show") return await show(deps, threadId, rest);
  return { exitCode: 1, stderr: `Unknown goal command "${sub}".\n\n${GOAL_USAGE}` };
}
