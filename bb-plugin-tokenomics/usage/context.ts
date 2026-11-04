// How big a thread's context is: the tokens every model call re-reads. bb
// reports it many times a turn; a large one is what makes cache reads run away.

export const CONTEXT_EVENT = "thread/contextWindowUsage/updated";

/** The fields of a context window event this module reads. */
export interface ContextEventLike {
  id: string;
  createdAt: number;
  type: string;
  data: unknown;
}

export interface ContextRow {
  eventId: string;
  createdAt: number;
  usedTokens: number;
  /** The model's context window, when the provider reports it. */
  contextWindow: number | null;
  /** Where the provider compacts on its own, when it says. */
  autoCompactAt: number | null;
}

interface ContextPayload {
  contextWindowUsage?: {
    usedTokens?: number | null;
    modelContextWindow?: number | null;
    snapshot?: { autoCompactAtTokens?: number | null } | null;
  };
}

/**
 * The ledger row for one context event, or null when it carries no size.
 * Claude Code sends one with no size straight after compacting, before the
 * new size is known.
 */
export function contextRowOf(event: ContextEventLike): ContextRow | null {
  if (event.type !== CONTEXT_EVENT) return null;
  const usage = (event.data as ContextPayload | null)?.contextWindowUsage;
  const used = usage?.usedTokens;
  if (typeof used !== "number" || used < 0) return null;
  return {
    eventId: event.id,
    createdAt: event.createdAt,
    usedTokens: used,
    contextWindow: usage?.modelContextWindow ?? null,
    autoCompactAt: usage?.snapshot?.autoCompactAtTokens ?? null,
  };
}

/** Where a thread's context earns a warning, and where an error; null turns a level off. */
export interface ContextThresholds {
  warning: number | null;
  error: number | null;
}

export type ContextLevel = "warning" | "error";

/** How a context of `usedTokens` rates against the thresholds, or null below both. */
export function contextLevel(usedTokens: number, thresholds: ContextThresholds): ContextLevel | null {
  if (thresholds.error !== null && usedTokens >= thresholds.error) return "error";
  if (thresholds.warning !== null && usedTokens >= thresholds.warning) return "warning";
  return null;
}

/** How many of the contexts are past the warning but not the error, and how many are past the error. */
export function countLevels(contexts: Iterable<number>, thresholds: ContextThresholds): Record<ContextLevel, number> {
  const counts = { warning: 0, error: 0 };
  for (const usedTokens of contexts) {
    const level = contextLevel(usedTokens, thresholds);
    if (level !== null) counts[level] += 1;
  }
  return counts;
}

/** A setting's value as a token count, or null when it is off. */
export function parseThreshold(value: string): number | null {
  const match = /^\s*([\d.,_]+)\s*([km]?)\s*$/i.exec(value);
  if (match === null) return null;
  const number = Number(match[1]!.replace(/[,_]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return null;
  const unit = match[2]!.toLowerCase();
  return Math.round(number * (unit === "k" ? 1_000 : unit === "m" ? 1_000_000 : 1));
}

/**
 * The smallest context bb offers to compact once its prompt cache expires
 * (apps/server/src/services/threads/compaction-offer.ts in bb). Below it,
 * re-reading the context uncached costs too little to matter.
 */
export const CACHE_EXPIRY_MIN_TOKENS = 100_000;

/**
 * When the thread's prompt cache expired, or null while it is still warm,
 * when the provider reports no lifetime, or when the context is too small to
 * matter. bb works this out the same way for its own compact-before-send
 * offer: the latest token usage event's time plus the provider's
 * promptCacheTtlMs (1 hour for Claude Code, sometimes 5 minutes).
 */
export function cacheExpiredAt(usedTokens: number, cacheExpiresAt: number | null, now: number): number | null {
  if (cacheExpiresAt === null || usedTokens < CACHE_EXPIRY_MIN_TOKENS) return null;
  return now >= cacheExpiresAt ? cacheExpiresAt : null;
}

/** How long ago, as the meter says it: "16 min", "2h", "6d". */
export function formatAgo(ms: number): string {
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
