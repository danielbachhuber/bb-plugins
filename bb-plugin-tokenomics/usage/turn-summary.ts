// Each turn's length, tokens, and commands, for the line under each turn and
// the strip above the composer. Pure: the inputs are the ledger's usage rows
// and timing rows, so a running turn can be summed without asking bb.
import { ZERO_TOKENS, type Tokens } from "./breakdown.js";
import { attributeUsage, type UsagePoint } from "./turns.js";
import { turnSplits, type TimingRows, type TurnSplit } from "./timing.js";

export interface TurnSummary extends Tokens {
  turnId: string;
  startedAt: number;
  /** Null while the turn is still running. */
  endedAt: number | null;
  /** Shell commands the turn ran, finished or not. */
  commands: number;
  /** Other tool calls, file reads, and edits. */
  tools: number;
  /** Where its time went; null while it runs. */
  time: TurnSplit | null;
}

export function turnSummaries(rows: readonly UsagePoint[], timings: TimingRows): TurnSummary[] {
  const started = timings.turns
    .filter((turn) => turn.startedAt !== null)
    .map((turn) => ({ turnId: turn.turnId, at: turn.startedAt! }));
  const completed = timings.turns
    .filter((turn) => turn.completedAt !== null)
    .map((turn) => ({ turnId: turn.turnId, at: turn.completedAt! }));
  const tokens = new Map(
    attributeUsage(rows, started, completed, new Map())
      .filter((turn) => turn.turnId !== null)
      .map((turn) => [turn.turnId!, turn]),
  );
  const splits = turnSplits(timings);
  const counts = new Map<string, { commands: Set<string>; tools: Set<string> }>();
  for (const item of timings.items) {
    if (item.turnId === null) continue;
    const entry = counts.get(item.turnId) ?? { commands: new Set(), tools: new Set() };
    (item.kind === "commandExecution" ? entry.commands : entry.tools).add(item.itemId);
    counts.set(item.turnId, entry);
  }
  const ends = new Map(completed.map((event) => [event.turnId, event.at]));
  return started
    .sort((a, b) => a.at - b.at)
    .map(({ turnId, at }) => {
      const used = tokens.get(turnId);
      return {
        turnId,
        startedAt: at,
        endedAt: ends.get(turnId) ?? null,
        input: used?.input ?? ZERO_TOKENS.input,
        cacheRead: used?.cacheRead ?? ZERO_TOKENS.cacheRead,
        output: used?.output ?? ZERO_TOKENS.output,
        commands: counts.get(turnId)?.commands.size ?? 0,
        tools: counts.get(turnId)?.tools.size ?? 0,
        time: splits.get(turnId) ?? null,
      };
    });
}

/** bb's timeline row ids name their turn as `|turn:<id>|` or `<thread>:<turn>:work-summary:`. */
export function turnIdOfRow(rowId: string): string | null {
  return /\|turn:([^|]+)\|/.exec(rowId)?.[1] ?? /^[^:]+:([^:]+):work-summary:/.exec(rowId)?.[1] ?? null;
}

/**
 * The row each turn's summary goes under: the last row of the turn. A row
 * that names no turn, such as a command or a tool call, belongs to the turn
 * before it, until one of your messages. A message you send while a turn
 * runs comes between its rows, so the turn's later rows still claim it.
 */
export function lastRowByTurn(rowIds: readonly string[]): Map<string, string> {
  const last = new Map<string, string>();
  let current: string | null = null;
  for (const rowId of rowIds) {
    const turnId = turnIdOfRow(rowId);
    if (turnId !== null) {
      current = turnId;
      last.set(turnId, rowId);
    } else if (/:user-seed:/.test(rowId)) {
      current = null;
    } else if (current !== null) {
      last.set(current, rowId);
    }
  }
  return last;
}

/** How many of a turn's commands its detail lists. */
export const MAX_COMMANDS = 10;

export interface TurnWork {
  /** The turn's slowest commands, up to MAX_COMMANDS; a running one has no length yet and comes first. */
  commands: Array<{ command: string; ms: number | null }>;
  /** Commands past the ones listed. */
  moreCommands: number;
  /** Every kind of tool it used, with how many and their summed lengths, longest first. */
  kinds: Array<{ kind: string; count: number; ms: number }>;
}

/** What one turn ran, for the card its summary opens. */
export function turnWork(timings: TimingRows, turnId: string): TurnWork {
  const items = timings.items.filter((item) => item.turnId === turnId);
  const length = (item: (typeof items)[number]) =>
    item.startedAt === null || item.completedAt === null ? null : Math.max(0, item.completedAt - item.startedAt);
  const commands = items
    .filter((item) => item.kind === "commandExecution")
    .map((item) => ({ command: item.label ?? "(no command)", ms: length(item) }))
    .sort((a, b) => (b.ms ?? Infinity) - (a.ms ?? Infinity));
  const kinds = new Map<string, { count: number; ms: number }>();
  for (const item of items) {
    const entry = kinds.get(item.kind) ?? { count: 0, ms: 0 };
    entry.count += 1;
    entry.ms += length(item) ?? 0;
    kinds.set(item.kind, entry);
  }
  return {
    commands: commands.slice(0, MAX_COMMANDS),
    moreCommands: Math.max(0, commands.length - MAX_COMMANDS),
    kinds: [...kinds].map(([kind, entry]) => ({ kind, ...entry })).sort((a, b) => b.ms - a.ms),
  };
}
