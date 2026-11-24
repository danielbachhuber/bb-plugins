// What a find-improvements run measures before any reviewer reads a call:
// which outputs every later call paid to re-read, whether the prompt cache
// held, and how much of each call is the prompt a thread starts with. Pure.
import {
  addParts,
  costOf,
  costOfRows,
  partsOfRow,
  partsTotal,
  ZERO_PARTS,
  type Costed,
  type PartRow,
  type TokenParts,
  type WeightTable,
} from "../usage/cost.js";
import { msText, tokensText, bytesText, type Boundary, type Call, type DigestTurn } from "./digest.js";

/** Bytes of text per token, near enough for English and code. */
export const BYTES_PER_TOKEN = 4;

/** A context that falls below this share of the one before was compacted or restarted. */
const COMPACTED = 0.5;

export interface RentPayer {
  call: Call;
  /** The output's size in tokens. */
  tokens: number;
  /** Model calls after it that re-read it. */
  later: number;
  /** tokens × later: what carrying it cost in cache reads. */
  rent: number;
}

/**
 * What each call's output cost the calls after it: its tokens times the
 * model calls that re-read it, until the context was compacted. The costliest
 * first.
 */
export function contextRent(calls: readonly Call[], boundaries: readonly Boundary[]): RentPayer[] {
  const resets = boundaries
    .filter((boundary, index) => index > 0 && boundary.context < boundaries[index - 1]!.context * COMPACTED)
    .map((boundary) => boundary.at);
  const payers: RentPayer[] = [];
  for (const call of calls) {
    if (call.outputBytes <= 0 || call.completedAt === undefined) continue;
    const done = call.completedAt;
    const reset = resets.find((at) => at > done) ?? Infinity;
    const later = boundaries.filter((boundary) => boundary.at > done && boundary.at < reset).length;
    const tokens = Math.round(call.outputBytes / BYTES_PER_TOKEN);
    if (later > 0) payers.push({ call, tokens, later, rent: tokens * later });
  }
  return payers.sort((a, b) => b.rent - a.rent);
}

export function rentText(payers: readonly RentPayer[], readWeight: number, limit = 5): string[] {
  const top = payers.filter((payer) => payer.rent >= 50_000).slice(0, limit);
  if (top.length === 0) return [];
  return [
    "Rent payers (output × later calls that re-read it):",
    ...top.map((payer) => {
      const where = `turn ${payer.call.turn + 1}${payer.call.call != null ? `, call ${payer.call.call}` : ""}`;
      return `  ${bytesText(payer.call.outputBytes)} × ${payer.later} calls = ${tokensText(payer.rent)} read (cost ${tokensText(payer.rent * readWeight)}): ${payer.call.text.slice(0, 100)} (${where})`;
    }),
  ];
}

/** The latest tokenUsage event's running total: the provider's current session. */
export interface SessionUsage {
  parts: TokenParts;
  ttlMs: number | null;
}

export interface CacheHealth {
  /** The thread's own calls, subagents left out: each has its own cache. */
  parts: TokenParts;
  /** Cache reads over all input. */
  hitRate: number;
  /** Cache writes over the thread's peak context; about 1 when each token was written once. */
  writesPerPeak: number | null;
  ttlMs: number;
  /** True when no row or event reported the lifetime, so 5 minutes is assumed. */
  ttlAssumed: boolean;
  /** Turns that started after the cache had expired, and what they wrote. */
  idle: Array<{ turn: number; gapMs: number; wrote: number }>;
  session: SessionUsage | null;
  healthy: boolean;
}

const DEFAULT_TTL_MS = 5 * 60_000;

export function cacheHealth(input: {
  providerId: string;
  rows: readonly PartRow[];
  turns: readonly DigestTurn[];
  peak: number;
  session: SessionUsage | null;
}): CacheHealth {
  const own = input.rows.filter((row) => !row.subagent);
  let parts = ZERO_PARTS;
  for (const row of own) parts = addParts(parts, partsOfRow(row, input.providerId));
  const inputTokens = parts.input + parts.cacheWrite + parts.cacheRead;
  const hitRate = inputTokens === 0 ? 1 : parts.cacheRead / inputTokens;
  const writesPerPeak = input.peak > 0 && parts.cacheWrite > 0 ? parts.cacheWrite / input.peak : null;
  const reported = [...own].reverse().find((row) => row.ttlMs !== null)?.ttlMs ?? input.session?.ttlMs ?? null;
  const ttlMs = reported ?? DEFAULT_TTL_MS;
  const idle: CacheHealth["idle"] = [];
  input.turns.forEach((turn, index) => {
    if (index === 0) return;
    const before = input.turns[index - 1]!;
    const gapMs = turn.startedAt - (before.endedAt ?? before.startedAt);
    if (gapMs > ttlMs) idle.push({ turn: index + 1, gapMs, wrote: turn.cacheWrite });
  });
  const healthy = hitRate >= 0.9 && (writesPerPeak === null || writesPerPeak <= 2) && idle.length === 0;
  return { parts, hitRate, writesPerPeak, ttlMs, ttlAssumed: reported === null, idle, session: input.session, healthy };
}

function percent(share: number): string {
  return `${(share * 100).toFixed(share >= 0.9 || share < 0.1 ? 1 : 0)}%`;
}

function ttlText(health: Pick<CacheHealth, "ttlMs" | "ttlAssumed">): string {
  const ttl = health.ttlMs % 3_600_000 === 0 ? `${health.ttlMs / 3_600_000}h` : msText(health.ttlMs);
  return `TTL ${ttl}${health.ttlAssumed ? " (assumed)" : ""}`;
}

/** One line when the cache held; otherwise a line per problem. */
export function cacheText(health: CacheHealth): string[] {
  const p = health.parts;
  const ratio = health.writesPerPeak === null ? "" : ` (${health.writesPerPeak.toFixed(1)}× peak context)`;
  const numbers = `${percent(health.hitRate)} hit rate, writes ${tokensText(p.cacheWrite)}${ratio}, uncached ${tokensText(p.input)}, ${ttlText(health)}`;
  if (health.healthy) return [`Cache: healthy, ${numbers}`];
  const lines = [`Cache: ${numbers}`];
  if (health.hitRate < 0.9) lines.push(`  Under 90% of input came from the cache.`);
  if (health.writesPerPeak !== null && health.writesPerPeak > 2) {
    lines.push(`  The context was written ${health.writesPerPeak.toFixed(1)} times over: the cache expired or the prompt's start changed.`);
  }
  for (const gap of health.idle) {
    lines.push(`  Turn ${gap.turn} started ${msText(gap.gapMs)} after the turn before, past the TTL, and wrote ${tokensText(gap.wrote)}.`);
  }
  if (health.session !== null) {
    const s = health.session.parts;
    lines.push(`  Provider session so far: ${tokensText(s.cacheRead)} read, ${tokensText(s.cacheWrite)} written, ${tokensText(s.input)} uncached, ${tokensText(s.output)} output.`);
  }
  return lines;
}

/** The run's cache health in one line. */
export function cacheSummary(healths: ReadonlyArray<{ health: CacheHealth; peak: number }>): string {
  let parts = ZERO_PARTS;
  let peaks = 0;
  let idleTurns = 0;
  let idleWrites = 0;
  for (const { health, peak } of healths) {
    parts = addParts(parts, health.parts);
    peaks += peak;
    idleTurns += health.idle.length;
    idleWrites += health.idle.reduce((sum, gap) => sum + gap.wrote, 0);
  }
  const input = parts.input + parts.cacheWrite + parts.cacheRead;
  const hit = input === 0 ? "no input" : `${percent(parts.cacheRead / input)} of input read from the cache`;
  const writes = peaks > 0 ? `, writes ${(parts.cacheWrite / peaks).toFixed(1)}× the threads' peak contexts` : "";
  const unhealthy = healths.filter(({ health }) => !health.healthy).length;
  const idle = idleTurns > 0 ? `; ${idleTurns} turns after an idle gap past the TTL rewrote ${tokensText(idleWrites)}` : "";
  return `Cache: ${hit}${writes}${idle}; ${unhealthy === 0 ? "every thread healthy" : `${unhealthy} of ${healths.length} threads need a look`}.`;
}

/** What a project's threads start every call with. */
export interface StartingPrompt {
  name: string;
  path: string | null;
  threads: number;
  providers: string[];
  /** Model calls in the window. */
  calls: number;
  /** Average context of those calls. */
  averageContext: number | null;
  /** Average context of the threads' first calls. */
  firstContext: number | null;
  /** Instruction files every call carries, with their sizes. */
  files: Array<{ path: string; bytes: number; sameAs?: string }>;
  /** Weight of a cache read, for pricing a trim. */
  readWeight: number;
}

export function startingPrompt(
  name: string,
  path: string | null,
  threads: ReadonlyArray<{ provider: string; firstContext: number | null; calls: number; contextRead: number }>,
): Omit<StartingPrompt, "files" | "readWeight"> {
  const firsts = threads.map((thread) => thread.firstContext).filter((n): n is number => n !== null && n > 0);
  const calls = threads.reduce((sum, thread) => sum + thread.calls, 0);
  const read = threads.reduce((sum, thread) => sum + thread.contextRead, 0);
  return {
    name,
    path,
    threads: threads.length,
    providers: [...new Set(threads.map((thread) => thread.provider))].sort(),
    calls,
    averageContext: calls > 0 ? Math.round(read / calls) : null,
    firstContext: firsts.length > 0 ? Math.round(firsts.reduce((sum, n) => sum + n, 0) / firsts.length) : null,
  };
}

export function startingPromptText(prompts: readonly StartingPrompt[]): string {
  const lines = [
    "# Projects",
    "",
    "Each project's checkout, and the prompt its threads start with. Every model call re-reads that prompt, so each 1K tokens trimmed from it saves 1K cache reads per call.",
    "",
  ];
  for (const prompt of prompts) {
    lines.push(`## ${prompt.name}: ${prompt.path ?? "no local checkout"}`);
    lines.push(`Threads in the window: ${prompt.threads} (${prompt.providers.join(", ") || "no provider"}), ${prompt.calls.toLocaleString("en-US")} model calls`);
    if (prompt.firstContext !== null) {
      const share = prompt.averageContext ? `, ${percent(prompt.firstContext / prompt.averageContext)} of an average call's ${tokensText(prompt.averageContext)}` : "";
      lines.push(`Starting prompt: the first call averages ${tokensText(prompt.firstContext)} tokens${share}.`);
    } else {
      lines.push("Starting prompt: no first call recorded.");
    }
    if (prompt.calls > 0) {
      lines.push(`Each 1K tokens trimmed saves ${tokensText(prompt.calls * 1_000)} cache reads (cost ${tokensText(prompt.calls * 1_000 * prompt.readWeight)}) over these calls.`);
    }
    if (prompt.files.length > 0) {
      lines.push("Instruction files:");
      for (const file of prompt.files) {
        lines.push(file.sameAs ? `- ${file.path}: the same file as ${file.sameAs}` : `- ${file.path}: ${bytesText(file.bytes)} (~${tokensText(file.bytes / BYTES_PER_TOKEN)} tokens)`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** A bb project as `projects.list` gives it: its name, checkouts, and remote. */
export interface ProjectSource {
  name: string;
  paths: string[];
  gitRemoteUrl: string | null;
}

/** `owner/name` from a GitHub remote URL, or null for another host. */
export function repoOf(url: string | null): string | null {
  if (url === null) return null;
  const match = /github\.com[:/]+([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match === null ? null : `${match[1]}/${match[2]}`;
}

/** The project whose checkout holds `target`, by the longest matching path; `personal` when none does. */
export function projectFor(target: string, projects: readonly ProjectSource[]): { project: string; repo: string | null } {
  let best: { project: string; repo: string | null; length: number } | null = null;
  for (const project of projects) {
    for (const raw of project.paths) {
      const path = raw.replace(/\/+$/, "");
      if (path === "" || (target !== path && !target.startsWith(`${path}/`))) continue;
      if (best === null || path.length > best.length) best = { project: project.name, repo: repoOf(project.gitRemoteUrl), length: path.length };
    }
  }
  return best === null ? { project: "personal", repo: null } : { project: best.project, repo: best.repo };
}

/**
 * What a thread used since `since`, its subagents included. bb reports a
 * thread's own usage only when a turn ends, so the turn still running is
 * estimated from its context samples: each call reads the context before it
 * from the cache and writes what it added.
 */
export function usageSince(
  rows: readonly PartRow[],
  boundaries: readonly Boundary[],
  since: number,
  providerId: string,
  table?: WeightTable,
): Costed & { estimated: number } {
  const recent = rows.filter((row) => row.at >= since);
  const recorded = costOfRows(recent, providerId, table);
  const lastOwn = Math.max(since, ...rows.filter((row) => !row.subagent).map((row) => row.at));
  let estimate = ZERO_PARTS;
  boundaries.forEach((boundary, index) => {
    if (boundary.at <= lastOwn || index === 0) return;
    const before = boundaries[index - 1]!.context;
    estimate = addParts(estimate, { input: 0, cacheWrite: Math.max(0, boundary.context - before), cacheRead: before, output: 0 });
  });
  const ttl = [...rows].reverse().find((row) => row.ttlMs !== null)?.ttlMs ?? null;
  const estimated = costOf(estimate, providerId, ttl, table);
  return {
    parts: addParts(recorded.parts, estimate),
    tokens: recorded.tokens + partsTotal(estimate),
    cost: recorded.cost + estimated,
    weighted: recorded.weighted,
    estimated: partsTotal(estimate),
  };
}
