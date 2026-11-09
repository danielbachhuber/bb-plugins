// Claude's forecast for a turn, and how the turn landed against it. Pure: the
// inputs are rows the ledger already holds, so scoring needs no call to bb.
//
// Claude forecasts model calls and minutes. Tokens follow from calls, since
// every call reads the whole context again, and each call adds to the
// context the next one reads.

/** One forecast as `bb tokenomics forecast` records it. */
export interface StoredForecast {
  /** When Claude called the tool, in epoch milliseconds. */
  at: number;
  callsLow: number;
  callsHigh: number;
  timeLowMs: number;
  timeHighMs: number;
  /** The thread's context when Claude forecast; null before any was recorded. */
  context: number | null;
  /** How much the thread's context grew per call recently; null when too few calls to tell. */
  growth: number | null;
  /** Claude's one-line reason. */
  note: string | null;
}

/** A turn's forecast, as the line and the strip draw it. */
export interface TurnForecast {
  calls: [number, number];
  timeMs: [number, number];
  /** Calls times the context; null when no context was recorded. */
  tokens: [number, number] | null;
  context: number | null;
  note: string | null;
}

export type Verdict = "in" | "over" | "under";

export function verdict(actual: number, [low, high]: readonly [number, number]): Verdict {
  return actual > high ? "over" : actual < low ? "under" : "in";
}

/**
 * Growth per call when a thread has too few calls to measure its own: about
 * the mean across three days of real threads (median 900, 90th percentile 4K).
 */
export const DEFAULT_GROWTH = 1_500;

/** How many of the thread's latest calls the growth is measured over. */
const GROWTH_CALLS = 30;

/**
 * The mean amount the context grew per call over the thread's latest calls.
 * Leaves out drops, such as a compaction, and jumps over 60K, such as a pasted
 * file, which a forecast can't expect. Null with fewer than three steps.
 */
export function growthPerCall(samples: readonly CallSample[]): number | null {
  const sizes: number[] = [];
  for (const sample of samples) if (sizes.at(-1) !== sample.usedTokens) sizes.push(sample.usedTokens);
  const steps = sizes
    .slice(1)
    .map((size, index) => size - sizes[index]!)
    .filter((step) => step > 0 && step < 60_000)
    .slice(-GROWTH_CALLS);
  return steps.length < 3 ? null : Math.round(steps.reduce((sum, step) => sum + step, 0) / steps.length);
}

/** Tokens for `calls` calls from `context`, each call reading what the last one added. */
function tokensFor(calls: number, context: number, growth: number): number {
  return calls * context + (growth * calls * (calls - 1)) / 2;
}

export function toTurnForecast(stored: StoredForecast): TurnForecast {
  const growth = stored.growth ?? DEFAULT_GROWTH;
  return {
    calls: [stored.callsLow, stored.callsHigh],
    timeMs: [stored.timeLowMs, stored.timeHighMs],
    tokens:
      stored.context === null
        ? null
        : [tokensFor(stored.callsLow, stored.context, growth), tokensFor(stored.callsHigh, stored.context, growth)],
    context: stored.context,
    note: stored.note,
  };
}

/**
 * The forecast Claude made during a turn: the first one recorded between its
 * start and its end, or until now while it runs. A second call in the same
 * turn does not replace the first, so a forecast can't be revised to fit.
 */
export function forecastInTurn(
  forecasts: readonly StoredForecast[],
  startedAt: number,
  endedAt: number | null,
): StoredForecast | null {
  let first: StoredForecast | null = null;
  for (const forecast of forecasts) {
    if (forecast.at < startedAt || (endedAt !== null && forecast.at > endedAt)) continue;
    if (first === null || forecast.at < first.at) first = forecast;
  }
  return first;
}

/** One context sample bb recorded after a model response. */
export interface CallSample {
  at: number;
  usedTokens: number;
}

/**
 * How many model calls a turn made. bb records the context after each model
 * response, sometimes twice for one response, so calls are the distinct
 * context sizes between the turn's start and end. Each call adds at least the
 * last call's reply to the context, so two calls never share a size. The
 * caller passes only per-call samples: bb's session sample, which carries an
 * auto-compact limit, is not a call.
 */
export function callsInTurn(samples: readonly CallSample[], startedAt: number, endedAt: number | null): number {
  const sizes = new Set<number>();
  for (const sample of samples) {
    if (sample.at < startedAt || (endedAt !== null && sample.at > endedAt)) continue;
    sizes.add(sample.usedTokens);
  }
  return sizes.size;
}

/** A finished turn with a forecast, for the track record. */
export interface ScoredTurn {
  calls: number;
  tokens: number;
  /** Model and tools time, without time spent waiting on the user. */
  workedMs: number;
  forecast: TurnForecast;
}

/** How many past forecasts the record covers. */
export const RECORD_SIZE = 20;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** "1.6× over", "1.3× under", or "about right": actual against the middle of the range. */
function lean(ratios: number[]): string {
  const typical = median(ratios);
  if (typical >= 1.15) return `${typical.toFixed(1)}× over`;
  if (typical <= 1 / 1.15) return `${(1 / typical).toFixed(1)}× under`;
  return "about right";
}

/**
 * One line Claude reads after forecasting: how its recent ranges landed.
 * Short on purpose, since it stays in the context for the rest of the thread.
 */
export function trackRecord(turns: readonly ScoredTurn[]): string {
  const recent = turns.slice(-RECORD_SIZE);
  if (recent.length === 0) return "No scored forecasts yet.";
  const callsIn = recent.filter((turn) => verdict(turn.calls, turn.forecast.calls) === "in").length;
  const timeIn = recent.filter((turn) => verdict(turn.workedMs, turn.forecast.timeMs) === "in").length;
  const middle = ([low, high]: [number, number]) => Math.max(1, (low + high) / 2);
  const callRatios = recent.map((turn) => turn.calls / middle(turn.forecast.calls));
  const timeRatios = recent.map((turn) => turn.workedMs / middle(turn.forecast.timeMs));
  return (
    `Last ${recent.length} forecasts: calls in range ${callsIn}/${recent.length} (actual ${lean(callRatios)}), ` +
    `time in range ${timeIn}/${recent.length} (actual ${lean(timeRatios)}). Aim for 80% in range.`
  );
}

/** Checks the tool's input; returns an error message, or null when it is usable. */
export function forecastInputError(input: {
  calls_low: number;
  calls_high: number;
  minutes_low: number;
  minutes_high: number;
}): string | null {
  if (input.calls_low < 1) return "--calls must start at 1 or more: the final reply is a model call too.";
  if (input.calls_high < input.calls_low) return "--calls must run from low to high, such as 4-8.";
  if (input.minutes_high < input.minutes_low) return "--minutes must run from low to high, such as 1-3.";
  return null;
}

/** A scored turn with where it ran, for `bb tokenomics forecasts`. */
export interface ForecastReport extends ScoredTurn {
  settings: TurnSettings | null;
  threadId: string;
  title: string | null;
  startedAt: number;
  note: string | null;
}

const minutesOf = (ms: number) => Math.round(ms / 6_000) / 10;

/** "76 of 10–25 calls (over)": one number against its range. */
function against(actual: string, low: string, high: string, unit: string, v: Verdict): string {
  return `${actual} of ${low}–${high}${unit}${v === "in" ? "" : ` (${v})`}`;
}

export function formatForecasts(
  reports: readonly ForecastReport[],
  days: number,
  formatTokens: (tokens: number) => string,
): string {
  if (reports.length === 0) return `No scored forecasts in the past ${days} days.`;
  // The summary line covers every setting; each turn below names its own.
  const lines = [trackRecord(reports), ""];
  for (const report of [...reports].reverse()) {
    const f = report.forecast;
    const parts = [
      against(String(report.calls), String(f.calls[0]), String(f.calls[1]), " calls", verdict(report.calls, f.calls)),
      against(
        String(minutesOf(report.workedMs)),
        String(minutesOf(f.timeMs[0])),
        String(minutesOf(f.timeMs[1])),
        " min",
        verdict(report.workedMs, f.timeMs),
      ),
      f.tokens === null
        ? `${formatTokens(report.tokens)} tokens`
        : against(formatTokens(report.tokens), formatTokens(f.tokens[0]), formatTokens(f.tokens[1]), " tokens", verdict(report.tokens, f.tokens)),
    ];
    const settings = report.settings === null ? "" : `  (${settingsLabel(report.settings)})`;
    lines.push(`${report.threadId}  ${report.title ?? "(untitled)"}${settings}`);
    lines.push(`  ${parts.join(" · ")}${report.note === null ? "" : `  "${report.note}"`}`);
  }
  return lines.join("\n");
}

/** "4-8", "4–8", or "5" as a range; null when it isn't one. */
export function parseRange(text: string | undefined): [number, number] | null {
  if (text === undefined) return null;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:(?:-|–|\.\.|to)\s*(\d+(?:\.\d+)?))?\s*$/.exec(text);
  if (match === null) return null;
  const low = Number(match[1]);
  return [low, match[2] === undefined ? low : Number(match[2])];
}

/** What every thread is told about forecasting. Fixed text, so it never breaks the prompt cache. */
export const FORECAST_INSTRUCTIONS = [
  "## Turn forecasts (Tokenomics)",
  "In every turn where you use a tool, forecast the turn with",
  '`bb tokenomics forecast --calls 4-8 --minutes 1-3 --note "Run the tests and fix what fails"`.',
  "Run it as a separate shell command in the same response as your first other tool call. That costs",
  "no extra model call. Never run it in a response of its own, which costs a whole model call. Skip it",
  "only when you answer without any tools.",
  "Forecast only this turn: the responses you send before your reply to the user, in this thread.",
  "Work you hand to another thread or a subagent is not part of it, so a turn that only starts a",
  "thread is a few calls and a minute, however big the work it hands off. A command that waits on",
  "that work, such as bb thread wait, is tool time: count the wait in --minutes, not in --calls.",
  "Give 80% ranges: you expect 8 in 10 turns to land inside them. --calls counts every response you",
  "send this turn, including the final reply. --minutes counts model and tool time, not time spent",
  "waiting on the user. The command prints how your recent ranges landed; shift or widen them from it.",
].join("\n");

/** The model settings a turn ran with, as bb records them when the turn is requested. */
export interface TurnSettings {
  model: string | null;
  /** "fast" in fast mode, "default" otherwise. */
  serviceTier: string | null;
  reasoningLevel: string | null;
}

export interface TurnRequest extends TurnSettings {
  /** When bb recorded the request, in epoch milliseconds. */
  at: number;
}

/** The event bb records for each message sent to a thread, with its execution settings. */
export const TURN_REQUEST_EVENT = "client/turn/requested";

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

/** The settings a `client/turn/requested` event carries, or null for any other event. */
export function turnRequestOf(event: { type: string; createdAt: number; data: unknown }): TurnRequest | null {
  if (event.type !== TURN_REQUEST_EVENT) return null;
  const execution = (event.data as { execution?: Record<string, unknown> } | null)?.execution;
  if (execution === undefined || execution === null) return null;
  const settings = {
    model: text(execution.model),
    serviceTier: text(execution.serviceTier),
    reasoningLevel: text(execution.reasoningLevel),
  };
  if (settings.model === null && settings.serviceTier === null && settings.reasoningLevel === null) return null;
  return { at: event.createdAt, ...settings };
}

/**
 * The settings a turn ran with: the last request at or before its start. A
 * message sent while a turn runs is a later request, and applies to the next turn.
 */
export function settingsAt(requests: readonly TurnRequest[], startedAt: number): TurnSettings | null {
  let found: TurnRequest | null = null;
  for (const request of requests) {
    if (request.at <= startedAt && (found === null || request.at >= found.at)) found = request;
  }
  return found === null ? null : { model: found.model, serviceTier: found.serviceTier, reasoningLevel: found.reasoningLevel };
}

export function sameSettings(a: TurnSettings | null, b: TurnSettings | null): boolean {
  return (
    a !== null && b !== null && a.model === b.model && a.serviceTier === b.serviceTier && a.reasoningLevel === b.reasoningLevel
  );
}

/** "claude-opus-5-5" as "Opus 5.5"; any other id as it is. */
export function modelName(model: string): string {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model);
  if (match === null) return model;
  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
  return `${family} ${match[2]}${match[3] === undefined ? "" : `.${match[3]}`}`;
}

/** "Opus 5.5, fast, medium reasoning", leaving out what bb didn't record. Fast is named only when on. */
export function settingsLabel(settings: TurnSettings): string {
  return [
    settings.model === null ? null : modelName(settings.model),
    settings.serviceTier === "fast" ? "fast" : null,
    settings.reasoningLevel === null ? null : `${settings.reasoningLevel} reasoning`,
  ]
    .filter((part) => part !== null)
    .join(", ");
}

/** Fewer turns than this with the current settings, and the record covers every setting instead. */
export const MIN_SAME_SETTINGS = 3;

/**
 * The track record for a turn about to run with `current`: only turns with
 * the same model, speed, and reasoning level once there are enough of them,
 * since time per call depends on all three. Until then, every turn, said so.
 */
export function trackRecordFor(turns: readonly (ScoredTurn & { settings: TurnSettings | null })[], current: TurnSettings | null): string {
  if (current === null) return trackRecord(turns);
  const same = turns.filter((turn) => sameSettings(turn.settings, current));
  if (same.length >= MIN_SAME_SETTINGS) return `With ${settingsLabel(current)}: ${trackRecord(same)}`;
  if (turns.length === 0) return trackRecord(turns);
  return `Fewer than ${MIN_SAME_SETTINGS} with ${settingsLabel(current)}, so across all settings: ${trackRecord(turns)}`;
}
