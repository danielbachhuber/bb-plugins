// Which threads a find-improvements run reads, and how many reviewers the
// token budget pays for. Pure, so the choices can be tested without bb.
import type { ThreadStats } from "./digest.js";
import { tokensText } from "./digest.js";

export interface Candidate {
  threadId: string;
  /** The plugin that started the thread, or null for the user. */
  origin: string | null;
  tokens: number;
  subagentTokens: number;
  /** Input-equivalent tokens (see usage/cost.ts), subagents included. */
  cost: number;
  subagentCost: number;
  turns: number;
  contextPeak: number;
}

/**
 * What a run costs outside the batch reviewers, and what each reviewer
 * costs, in input-equivalent tokens (see usage/cost.ts). On Claude Code a
 * thread's cost is about a sixth of its raw tokens, since most of them are
 * cache reads, so these are the raw estimates of a trial run (2.5M, 1.5M,
 * 1.5M) at that rate, rounded up.
 */
export interface Budget {
  total: number;
  /** The thread running the skill: reading reports, merging, pricing, publishing. */
  main: number;
  /** The reviewer that searches for recent token-saving practices. */
  research: number;
  /** One batch reviewer reading about BATCH_BYTES of digests. */
  reviewer: number;
}

export const DEFAULT_BUDGET: Budget = {
  total: 2_000_000,
  main: 400_000,
  research: 300_000,
  reviewer: 300_000,
};

/** Digest text one reviewer reads. Larger batches grow every call's context. */
export const BATCH_BYTES = 70_000;
/** Threads a single plugin may put in a run, so routine sweeps don't crowd it out. */
export const PER_PLUGIN = 2;
export const MAX_REVIEWERS = 6;

/** Batch reviewers the budget pays for, at least 1. */
export function reviewersFor(budget: Budget): number {
  const left = budget.total - budget.main - budget.research;
  return Math.max(1, Math.min(MAX_REVIEWERS, Math.floor(left / budget.reviewer)));
}

export function estimate(budget: Budget, reviewers: number): number {
  return budget.main + budget.research + reviewers * budget.reviewer;
}

/**
 * A thread's place in the queue. Cost dominates, since that is what a fix
 * saves; the main thread's own cost counts more than its subagents', which
 * already ran in a separate context.
 */
export function score(candidate: Candidate): number {
  const main = Math.max(0, candidate.cost - candidate.subagentCost);
  return main + candidate.subagentCost * 0.5;
}

/** The candidates in score order, with at most PER_PLUGIN per starting plugin. */
export function rank(candidates: readonly Candidate[], perPlugin = PER_PLUGIN): Candidate[] {
  const per = new Map<string, number>();
  const out: Candidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => score(b) - score(a))) {
    if (candidate.origin !== null) {
      const n = per.get(candidate.origin) ?? 0;
      if (n >= perPlugin) continue;
      per.set(candidate.origin, n + 1);
    }
    out.push(candidate);
  }
  return out;
}

/**
 * Packs digests into at most `reviewers` batches of about `limit` bytes, in
 * the order given, first fit. A digest that fits no batch is left out, so
 * the run stays inside its budget; one larger than `limit` is clipped by the
 * caller before it gets here.
 */
export function pack(
  sizes: ReadonlyArray<{ id: string; bytes: number }>,
  reviewers: number,
  limit = BATCH_BYTES,
): { batches: Map<string, number>; left: string[] } {
  const totals: number[] = [];
  const batches = new Map<string, number>();
  const left: string[] = [];
  for (const { id, bytes } of sizes) {
    let placed = false;
    for (let i = 0; i < totals.length; i += 1) {
      if (totals[i]! + bytes <= limit) {
        totals[i] = totals[i]! + bytes;
        batches.set(id, i + 1);
        placed = true;
        break;
      }
    }
    if (!placed && totals.length < reviewers) {
      totals.push(bytes);
      batches.set(id, totals.length);
      placed = true;
    }
    if (!placed) left.push(id);
  }
  return { batches, left };
}

/**
 * What no single thread shows: the same command kinds, files, and skills
 * across threads, which point to a tool or instruction the repository lacks.
 */
export function patternsText(
  threads: ReadonlyArray<{ threadId: string; project: string; title: string; tokens: number; cost: number; stats: ThreadStats }>,
): string {
  const lines = ["# Patterns across the selected threads", ""];
  const byProject = new Map<string, typeof threads[number][]>();
  for (const thread of threads) byProject.set(thread.project, [...(byProject.get(thread.project) ?? []), thread]);

  for (const [project, group] of byProject) {
    const total = group.reduce((sum, t) => sum + t.tokens, 0);
    const cost = group.reduce((sum, t) => sum + t.cost, 0);
    lines.push(`## ${project}: ${group.length} threads, ${tokensText(cost)} cost (${tokensText(total)} tokens)`, "");
    if (group.length < 2) {
      lines.push("One thread, so nothing to compare.", "");
      continue;
    }
    const files = new Map<string, Set<string>>();
    const kinds = new Map<string, { threads: Set<string>; runs: number }>();
    const failed = new Map<string, { threads: Set<string>; runs: number }>();
    const skills = new Map<string, Set<string>>();
    for (const thread of group) {
      for (const file of thread.stats.filesRead) files.set(file, (files.get(file) ?? new Set()).add(thread.threadId));
      for (const [kind, runs] of thread.stats.commandKinds) {
        const entry = kinds.get(kind) ?? { threads: new Set(), runs: 0 };
        entry.threads.add(thread.threadId);
        entry.runs += runs;
        kinds.set(kind, entry);
      }
      for (const [kind, runs] of thread.stats.failedKinds) {
        const entry = failed.get(kind) ?? { threads: new Set(), runs: 0 };
        entry.threads.add(thread.threadId);
        entry.runs += runs;
        failed.set(kind, entry);
      }
      for (const skill of thread.stats.skills) skills.set(skill, (skills.get(skill) ?? new Set()).add(thread.threadId));
    }
    const shared = [...files].filter(([, ids]) => ids.size >= 2).sort((a, b) => b[1].size - a[1].size);
    if (shared.length > 0) {
      lines.push("Files read in more than one thread (the same exploration, repeated):");
      for (const [file, ids] of shared.slice(0, 15)) lines.push(`- ${file}: ${ids.size} threads (${[...ids].join(", ")})`);
      lines.push("");
    }
    const common = [...kinds].filter(([, e]) => e.threads.size >= 2).sort((a, b) => b[1].runs - a[1].runs);
    if (common.length > 0) {
      lines.push("Command kinds run in more than one thread:");
      for (const [kind, e] of common.slice(0, 15)) lines.push(`- \`${kind}\`: ${e.runs} runs in ${e.threads.size} threads`);
      lines.push("");
    }
    const failing = [...failed].sort((a, b) => b[1].runs - a[1].runs);
    if (failing.length > 0) {
      lines.push("Commands that failed:");
      for (const [kind, e] of failing.slice(0, 10)) lines.push(`- \`${kind}\`: ${e.runs} failures in ${e.threads.size} threads`);
      lines.push("");
    }
    const loaded = [...skills].filter(([, ids]) => ids.size >= 2);
    if (loaded.length > 0) {
      lines.push("Skills loaded in more than one thread:");
      for (const [skill, ids] of loaded) lines.push(`- ${skill}: ${ids.size} threads`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
