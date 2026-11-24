// A find-improvements run's own record, `run.json`, which `collect` writes
// and `price`, `view`, and `summary` read, and the summary shown at the end
// of a run. Pure.
import type { TokenParts } from "../usage/cost.js";
import { msText, tokensText } from "./digest.js";
import { costText, priceLine, type Findings } from "./findings.js";

export interface RunGroup {
  name: string;
  threads: number;
  tokens: number;
  cost: number;
  /** False for a provider with no cost weights. */
  weighted?: boolean;
}

export interface Run {
  out: string;
  /** When `collect` ran; the run's own usage is counted from here. */
  startedAt: number;
  /** The start of the window the threads were picked from, or null when they were named. */
  since: number | null;
  /** The window's length in days, or null when the threads were named. */
  windowDays: number | null;
  /** The run's budget in input-equivalent tokens. */
  budget: number;
  threadIds: string[];
  threadCount: number;
  /** What the analyzed threads used, raw and as cost. */
  tokens: number;
  cost: number;
  parts: TokenParts;
  byProject: RunGroup[];
  byProvider: RunGroup[];
  /** The analyzed threads' cache health in one line. */
  cache: string;
}

function share(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const value = (part / whole) * 100;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)}%`;
}

/**
 * What every fix would save together. Two findings can name the same turn,
 * so each turn's savings are capped at what the turn cost, then each
 * thread's at what its named turns and whole-thread entries cost.
 */
export function combinedSavings(findings: Findings): { tokens: number; cost: number } {
  const turns = new Map<string, { tokens: number; cost: number; capTokens: number; capCost: number }>();
  for (const finding of findings.findings) {
    for (const entry of finding.savingsByTurn ?? []) {
      const key = `${entry.threadId}\u0000${entry.turn ?? "*"}`;
      const sum = turns.get(key) ?? { tokens: 0, cost: 0, capTokens: entry.capTokens, capCost: entry.capCost };
      sum.tokens += entry.tokens;
      sum.cost += entry.cost;
      turns.set(key, sum);
    }
  }
  const threads = new Map<string, { tokens: number; cost: number; capTokens: number; capCost: number }>();
  for (const [key, sum] of turns) {
    const [threadId, turn] = key.split("\u0000") as [string, string];
    const thread = threads.get(threadId) ?? { tokens: 0, cost: 0, capTokens: 0, capCost: 0 };
    thread.tokens += Math.min(sum.tokens, sum.capTokens);
    thread.cost += Math.min(sum.cost, sum.capCost);
    // A whole-thread entry's cap already covers every turn.
    if (turn === "*") {
      thread.capTokens = Math.max(thread.capTokens, sum.capTokens);
      thread.capCost = Math.max(thread.capCost, sum.capCost);
    } else if (!turns.has(`${threadId}\u0000*`)) {
      thread.capTokens += sum.capTokens;
      thread.capCost += sum.capCost;
    }
    threads.set(threadId, thread);
  }
  let tokens = 0;
  let cost = 0;
  for (const thread of threads.values()) {
    tokens += Math.min(thread.tokens, thread.capTokens);
    cost += Math.min(thread.cost, thread.capCost);
  }
  return { tokens, cost };
}


/** The end-of-run summary, in markdown, for the view and for chat. */
/** A table cell's text, with pipes escaped so a title cannot break the row. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

/**
 * The end-of-run report, as Markdown tables, so it reads as a table in
 * chat and in the view. Show it as is, never inside a code block.
 */
export function summarize(findings: Findings, run: Run): string {
  const p = run.parts;
  const lines = [
    `**Analyzed:** ${run.threadCount} threads, ${costText(run)}.`,
    "",
    "| Tokens | Count | Share |",
    "|---|--:|--:|",
    `| Uncached input | ${tokensText(p.input)} | ${share(p.input, run.tokens)} |`,
    `| Cache writes | ${tokensText(p.cacheWrite)} | ${share(p.cacheWrite, run.tokens)} |`,
    `| Cache reads | ${tokensText(p.cacheRead)} | ${share(p.cacheRead, run.tokens)} |`,
    `| Output | ${tokensText(p.output)} | ${share(p.output, run.tokens)} |`,
    "",
    "| Project or provider | Threads | Cost | Tokens | Share of cost |",
    "|---|--:|--:|--:|--:|",
    ...[...run.byProject, ...run.byProvider].map(
      (group) =>
        `| ${cell(group.name)}${group.weighted === false ? " (unweighted)" : ""} | ${group.threads} | ${tokensText(group.cost)} | ${tokensText(group.tokens)} | ${share(group.cost, run.cost)} |`,
    ),
    "",
    `**Cache:** ${run.cache.replace(/^Cache:\s*/, "")}`,
    "",
  ];
  const all = combinedSavings(findings);
  if (findings.findings.length === 0) {
    lines.push("**No fixes found.**");
  } else {
    const perWeek =
      run.windowDays !== null && run.windowDays >= 1
        ? ` At this run's rate, about ${tokensText((all.cost * 7) / run.windowDays)} cost (${tokensText((all.tokens * 7) / run.windowDays)} tokens) a week.`
        : "";
    lines.push(
      `**If every fix lands:** saves ${costText(all)}, ${share(all.cost, run.cost)} of the analyzed cost.${perWeek}`,
      "",
      "| # | Fix | Threads | Cost of the waste | Saves | Time saved |",
      "|--:|---|--:|--:|--:|--:|",
      ...findings.findings.map((finding, index) => {
        const cost = finding.totalCost;
        const saves = finding.estimatedSavings;
        return [
          `| ${index + 1}`,
          cell(finding.title),
          cost ? String(cost.threads) : "–",
          cost ? `${tokensText(cost.cost)} (${tokensText(cost.tokens)} tokens)` : "not priced",
          saves ? `${tokensText(saves.cost)} (${tokensText(saves.tokens)} tokens)` : "–",
          saves && saves.ms > 0 ? `${msText(saves.ms)} |` : "– |",
        ].join(" | ");
      }),
    );
  }
  lines.push("");
  const used = findings.runTokens;
  lines.push(
    used
      ? `**This run:** ${costText(used)} of its ${tokensText(run.budget)} budget (${share(used.cost, run.budget)}).`
      : `**This run:** budget ${tokensText(run.budget)}; what it used is filled in by \`view\`.`,
  );
  return lines.join("\n");
}
