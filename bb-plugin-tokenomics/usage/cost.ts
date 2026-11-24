// What tokens cost, as input-equivalent tokens: each part of a call weighted by
// what the provider charges for it against fresh input. A cache read is cheap,
// a cache write and output are dear, so two threads with the same token count
// can cost very different amounts. Pure.

/** A call's tokens, split the way providers price them. */
export interface TokenParts {
  /** Input read fresh and not written to the cache. */
  input: number;
  /** Input written to the prompt cache. */
  cacheWrite: number;
  /** Input served from the prompt cache. */
  cacheRead: number;
  output: number;
}

export const ZERO_PARTS: TokenParts = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };

/** Each part's price against one token of fresh input. */
export interface Weights {
  input: number;
  /** A cache write that lives less than an hour. */
  cacheWrite: number;
  /** A cache write that lives an hour or more. */
  cacheWriteLong: number;
  cacheRead: number;
  output: number;
}

/** Weights by provider id. A provider missing from it is unweighted. */
export type WeightTable = Record<string, Partial<Weights>>;

const UNWEIGHTED: Weights = { input: 1, cacheWrite: 1, cacheWriteLong: 1, cacheRead: 1, output: 1 };

/** Anthropic's prices relative to base input: reads 0.1x, 5-minute writes 1.25x, 1-hour writes 2x, output 5x. */
export const DEFAULT_WEIGHTS: WeightTable = {
  "claude-code": { input: 1, cacheWrite: 1.25, cacheWriteLong: 2, cacheRead: 0.1, output: 5 },
};

const HOUR_MS = 3_600_000;

/**
 * The defaults with the setting's overrides on top, such as
 * `{"codex": {"cacheRead": 0.1, "output": 4}}`. A part an override leaves out
 * keeps its default, or 1 for a provider with no defaults. Throws on JSON
 * that is not an object of objects of numbers.
 */
export function parseWeights(json: string): WeightTable {
  const table: WeightTable = Object.fromEntries(Object.entries(DEFAULT_WEIGHTS).map(([id, w]) => [id, { ...w }]));
  if (json.trim() === "") return table;
  const parsed = JSON.parse(json) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("cost weights must be a JSON object keyed by provider id");
  for (const [providerId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`cost weights for ${providerId} must be an object`);
    const weights: Partial<Weights> = { ...table[providerId] };
    for (const [part, weight] of Object.entries(value as Record<string, unknown>)) {
      if (!(part in UNWEIGHTED)) throw new Error(`unknown part "${part}" for ${providerId}; use ${Object.keys(UNWEIGHTED).join(", ")}`);
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) throw new Error(`${providerId}.${part} must be a number from 0`);
      weights[part as keyof Weights] = weight;
    }
    table[providerId] = weights;
  }
  return table;
}

/** The provider's weights, and whether any were set; an unweighted provider counts every token as 1. */
export function weightsFor(providerId: string, table: WeightTable = DEFAULT_WEIGHTS): { weights: Weights; weighted: boolean } {
  const set = table[providerId];
  if (set === undefined) return { weights: UNWEIGHTED, weighted: false };
  return { weights: { ...UNWEIGHTED, ...set }, weighted: true };
}

/** Input-equivalent tokens for `parts` on `providerId`, with the cache's lifetime when known. */
export function costOf(parts: TokenParts, providerId: string, ttlMs?: number | null, table: WeightTable = DEFAULT_WEIGHTS): number {
  const { weights } = weightsFor(providerId, table);
  const write = ttlMs != null && ttlMs >= HOUR_MS ? weights.cacheWriteLong : weights.cacheWrite;
  return Math.round(
    parts.input * weights.input + parts.cacheWrite * write + parts.cacheRead * weights.cacheRead + parts.output * weights.output,
  );
}

export function addParts(a: TokenParts, b: TokenParts): TokenParts {
  return {
    input: a.input + b.input,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead,
    output: a.output + b.output,
  };
}

export function partsTotal(parts: TokenParts): number {
  return parts.input + parts.cacheWrite + parts.cacheRead + parts.output;
}

/** One stored call or turn of usage, as the ledger holds it. */
export interface PartRow {
  at: number;
  /** Fresh input, cache writes included. */
  input: number;
  /** The part of `input` written to the cache; null on rows stored before it was kept apart. */
  cacheWrite: number | null;
  cacheRead: number;
  output: number;
  ttlMs: number | null;
  /** A Claude Code subagent's call rather than the thread's own. */
  subagent: boolean;
}

/**
 * A row's parts. Rows stored before cache writes were kept apart have only
 * fresh input with the writes folded in. On Claude Code nearly all of that
 * is cache writes (uncached input is a few hundred tokens a session), so it
 * counts as writes there; on other providers it stays uncached input.
 */
export function partsOfRow(row: Pick<PartRow, "input" | "cacheWrite" | "cacheRead" | "output">, providerId: string): TokenParts {
  const written = row.cacheWrite ?? (providerId === "claude-code" ? row.input : 0);
  const cacheWrite = Math.min(Math.max(0, written), row.input);
  return { input: row.input - cacheWrite, cacheWrite, cacheRead: row.cacheRead, output: row.output };
}

export interface Costed {
  parts: TokenParts;
  /** Every token, unweighted. */
  tokens: number;
  /** Input-equivalent tokens. */
  cost: number;
  weighted: boolean;
}

export const ZERO_COSTED: Costed = { parts: ZERO_PARTS, tokens: 0, cost: 0, weighted: true };

/** The parts and cost of a set of rows on one provider, each row priced at its own cache lifetime. */
export function costOfRows(
  rows: ReadonlyArray<Pick<PartRow, "input" | "cacheWrite" | "cacheRead" | "output" | "ttlMs">>,
  providerId: string,
  table: WeightTable = DEFAULT_WEIGHTS,
): Costed {
  let parts = ZERO_PARTS;
  let cost = 0;
  for (const row of rows) {
    const rowParts = partsOfRow(row, providerId);
    parts = addParts(parts, rowParts);
    cost += costOf(rowParts, providerId, row.ttlMs, table);
  }
  return { parts, tokens: partsTotal(parts), cost, weighted: weightsFor(providerId, table).weighted };
}

export function addCosted(a: Costed, b: Costed): Costed {
  return {
    parts: addParts(a.parts, b.parts),
    tokens: a.tokens + b.tokens,
    cost: a.cost + b.cost,
    weighted: a.weighted && b.weighted,
  };
}

/**
 * Each turn's cost, with its subagents' share and its own cache writes. A
 * row belongs to the last turn that started at or before it; rows before the
 * first turn are left out.
 */
export function costByTurn(
  starts: readonly number[],
  rows: readonly PartRow[],
  providerId: string,
  table: WeightTable = DEFAULT_WEIGHTS,
): Array<{ total: Costed; subagents: Costed; ownCacheWrite: number }> {
  const byTurn = starts.map(() => ({ own: [] as PartRow[], sub: [] as PartRow[] }));
  for (const row of rows) {
    let index = -1;
    for (let i = 0; i < starts.length; i += 1) if (starts[i]! <= row.at) index = i;
    if (index === -1) continue;
    (row.subagent ? byTurn[index]!.sub : byTurn[index]!.own).push(row);
  }
  return byTurn.map(({ own, sub }) => {
    const mine = costOfRows(own, providerId, table);
    const subagents = costOfRows(sub, providerId, table);
    return { total: addCosted(mine, subagents), subagents, ownCacheWrite: mine.parts.cacheWrite };
  });
}
