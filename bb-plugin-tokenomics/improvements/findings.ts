// A find-improvements run's findings: their shape, what each cost and would
// save, and the Impromptu UI view that presents them. Pure.
import { msText, tokensText, type DigestTurn } from "./digest.js";

export const WASTE_KINDS = [
  "repeated exploration",
  "large output",
  "rereads",
  "failed retries",
  "model work a script could do",
  "undelegated context",
  "duplicate subagents",
  "oversized model or effort",
  "context carried into later turns",
  "starting prompt",
] as const;

export const FIX_TYPES = ["repository tool", "skill", "agent instructions", "plugin", "setting"] as const;

export interface Removes {
  threadId: string;
  /** Turn number from the thread's digest; left out, the whole thread. */
  turn?: number;
  /** Calls the waste took there; left out, all of the turn's calls. */
  calls?: number;
  /** Calls the fix removes; left out, the same as `calls`. */
  removed?: number;
  /**
   * Tokens the fix takes out of the context of every call in the turn, or of
   * every call in the thread when `turn` is left out, such as a trimmed
   * instruction file or output kept out of the main thread. Priced as that
   * many cache reads per call. Not with `removed`.
   */
  contextCut?: number;
}

export interface Evidence {
  quote: string;
  threadId: string;
  turn?: number;
}

export interface Source {
  title: string;
  url: string;
  date: string;
}

export interface Finding {
  title: string;
  waste: string;
  fixType: string;
  /** Absolute path of the file to change or create. */
  target: string;
  /** bb project the fix is made in, or `personal`; `price` sets it from the target. */
  project?: string;
  /** `owner/name` on GitHub for the issue, or null when the target has no GitHub remote; `price` sets it. */
  repo?: string | null;
  threads: string[];
  removes: Removes[];
  /** One line on why the fix removes those calls. */
  basis: string;
  evidence: Evidence[];
  /** The issue body and the PR thread's task: the change, where, and how to tell it is done. */
  task: string;
  sources?: Source[];
  totalCost?: { tokens: number; cost: number; ms: number; threads: number } | null;
  estimatedSavings?: { tokens: number; cost: number; ms: number } | null;
  /** What each `removes` entry saves, and what the turn (or thread) it is in cost, so overlapping fixes can be capped. */
  savingsByTurn?: TurnSaving[];
}

export interface TurnSaving {
  threadId: string;
  /** Null for the whole thread. */
  turn: number | null;
  tokens: number;
  cost: number;
  capTokens: number;
  capCost: number;
}

export interface Findings {
  /** Threads the reviewers read; `price` fills it from run.json. */
  threadCount: number;
  /** Tokens those threads used in all. */
  threadTokens?: number;
  /** Their cost in input-equivalent tokens. */
  threadCost?: number;
  /** What the run itself used, filled in by `view`. */
  runTokens?: { tokens: number; cost: number } | null;
  findings: Finding[];
}

export type PricedTurn = DigestTurn;

/** A thread's turns, and what one cache read costs on its provider. */
export interface PricedThread {
  turns: readonly PricedTurn[];
  readWeight: number;
}

type Amount = { tokens: number; cost: number; ms: number };

function whole(turns: readonly PricedTurn[]): Amount {
  return {
    tokens: turns.reduce((sum, turn) => sum + turn.tokens, 0),
    cost: turns.reduce((sum, turn) => sum + turn.cost, 0),
    ms: turns.reduce((sum, turn) => sum + (turn.endedAt === null ? 0 : turn.endedAt - turn.startedAt), 0),
  };
}

/** Tokens, cost, and time of `calls` of the turns' calls; all of them includes their subagents. */
function share(turns: readonly PricedTurn[], calls: number): Amount {
  const total = turns.reduce((sum, turn) => sum + turn.calls, 0);
  const all = whole(turns);
  if (total === 0) return { tokens: 0, cost: 0, ms: 0 };
  if (calls >= total) return all;
  // Every call re-reads the whole context, so a turn's own tokens are spread
  // evenly over its calls. Which calls started a subagent is not known, so a
  // part of the turn leaves its subagents out.
  const tokens = turns.reduce((sum, turn) => sum + turn.tokens - turn.subagentTokens, 0);
  const cost = turns.reduce((sum, turn) => sum + turn.cost - turn.subagentCost, 0);
  return {
    tokens: Math.round((tokens * calls) / total),
    cost: Math.round((cost * calls) / total),
    ms: Math.round((all.ms * calls) / total),
  };
}

/**
 * What a finding's named calls cost and what its fix removes, in tokens and
 * input-equivalent cost. `problems` names each entry that could not be
 * priced, such as a turn number the thread does not have.
 */
export function price(
  removes: readonly Removes[],
  threadOf: (threadId: string) => PricedThread,
): { cost: Amount & { threads: number }; savings: Amount; byTurn: TurnSaving[]; problems: string[] } {
  const cost = { tokens: 0, cost: 0, ms: 0, threads: 0 };
  const savings = { tokens: 0, cost: 0, ms: 0 };
  const threads = new Set<string>();
  const byTurn: TurnSaving[] = [];
  const problems: string[] = [];
  for (const entry of removes) {
    const thread = threadOf(entry.threadId);
    const turns = entry.turn === undefined ? thread.turns : thread.turns.filter((_, index) => index + 1 === entry.turn);
    if (turns.length === 0) {
      problems.push(`${entry.threadId}: no data for ${entry.turn === undefined ? "any turn" : `turn ${entry.turn}`}`);
      continue;
    }
    const available = turns.reduce((sum, turn) => sum + turn.calls, 0);
    const calls = Math.min(entry.calls ?? available, available);
    const spent = share(turns, calls);
    let saved: Amount;
    if (entry.contextCut !== undefined) {
      // Each call reads the context from the cache, so a smaller context saves that many reads per call.
      const tokens = Math.min(Math.round(entry.contextCut * calls), spent.tokens);
      saved = { tokens, cost: Math.min(Math.round(tokens * thread.readWeight), spent.cost), ms: 0 };
    } else {
      saved = share(turns, Math.min(entry.removed ?? calls, calls));
    }
    cost.tokens += spent.tokens;
    cost.cost += spent.cost;
    cost.ms += spent.ms;
    savings.tokens += saved.tokens;
    savings.cost += saved.cost;
    savings.ms += saved.ms;
    const cap = whole(turns);
    byTurn.push({ threadId: entry.threadId, turn: entry.turn ?? null, tokens: saved.tokens, cost: saved.cost, capTokens: cap.tokens, capCost: cap.cost });
    threads.add(entry.threadId);
  }
  cost.threads = threads.size;
  return { cost, savings, byTurn, problems };
}

/** Prices every finding in place, ranks them by cost saved, and returns one line each. */
export function priceAll(findings: Findings, threadOf: (threadId: string) => PricedThread): string[] {
  const lines: string[] = [];
  for (const finding of findings.findings) {
    const { cost, savings, byTurn, problems } = price(finding.removes ?? [], threadOf);
    finding.totalCost = cost.threads > 0 ? cost : null;
    finding.estimatedSavings = cost.threads > 0 ? savings : null;
    finding.savingsByTurn = byTurn;
    for (const problem of problems) lines.push(`warning: ${finding.title}: ${problem}`);
  }
  findings.findings.sort((a, b) => (b.estimatedSavings?.cost ?? -1) - (a.estimatedSavings?.cost ?? -1));
  findings.findings.forEach((finding, index) => {
    lines.push(`${index + 1}. ${finding.title}: ${priceLine(finding)}`);
  });
  return lines;
}

/** `150K cost (1.2M tokens)`: input-equivalent cost first, the raw count beside it. */
export function costText(amount: { tokens: number; cost: number }): string {
  return `${tokensText(amount.cost)} cost (${tokensText(amount.tokens)} tokens)`;
}

export function priceLine(finding: Finding): string {
  const cost = finding.totalCost;
  if (!cost) return "not priced";
  const n = cost.threads;
  const saved = finding.estimatedSavings;
  const saves = saved ? `; saves about ${costText(saved)}${saved.ms > 0 ? `, ${msText(saved.ms)}` : ""}` : "";
  return `${costText(cost)}, ${msText(cost.ms)} across ${n} thread${n === 1 ? "" : "s"}${saves}`;
}

/** Problems that would make a card useless, so the skill fixes them before publishing. */
export function validate(findings: Findings): string[] {
  const problems: string[] = [];
  findings.findings.forEach((finding, index) => {
    const at = `finding ${index + 1} (${finding.title ?? "untitled"})`;
    for (const key of ["title", "waste", "fixType", "target", "project", "basis", "task"] as const) {
      if (typeof finding[key] !== "string" || finding[key].trim() === "") problems.push(`${at}: ${key} is missing`);
    }
    if (typeof finding.target === "string" && !finding.target.startsWith("/")) problems.push(`${at}: target must be an absolute path`);
    if (!Array.isArray(finding.threads) || finding.threads.length === 0) problems.push(`${at}: threads is empty`);
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) problems.push(`${at}: evidence is empty`);
    if (!Array.isArray(finding.removes) || finding.removes.length === 0) problems.push(`${at}: removes is empty, so it cannot be priced`);
    (Array.isArray(finding.removes) ? finding.removes : []).forEach((entry, n) => {
      if (entry.removed !== undefined && entry.contextCut !== undefined) {
        problems.push(`${at}: removes[${n}] has both removed and contextCut; give one, or neither for the whole turn`);
      }
      if (entry.contextCut !== undefined && !(typeof entry.contextCut === "number" && entry.contextCut > 0)) {
        problems.push(`${at}: removes[${n}].contextCut must be a number of tokens above 0`);
      }
    });
    if (finding.repo !== null && finding.repo !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(finding.repo)) {
      problems.push(`${at}: repo must be owner/name or null`);
    }
    if (typeof finding.task === "string" && !/done is/i.test(finding.task)) problems.push(`${at}: task has no "Done is:" list`);
  });
  return problems;
}

function quoteLine(evidence: Evidence): string {
  const text = evidence.quote.split(/\s+/).filter(Boolean).join(" ");
  const where = evidence.turn === undefined ? `\`${evidence.threadId}\`` : `\`${evidence.threadId}\` turn ${evidence.turn}`;
  return `> ${text}\n>\n> ${where}`;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** The PR thread's first message: the task as the user edited it, then where it was found. */
function threadPrompt(finding: Finding): string {
  const found = unique(finding.threads).map((id) => `@thread:${id}`).join(" ");
  return [
    "{draft}",
    "",
    `Found by tokenomics-find-improvements in: ${found}`,
    "",
    "Make the change and open a pull request for it, following the repository's own rules for branches and commits.",
  ].join("\n");
}

function issueMessage(finding: Finding, id: string): string {
  return [
    `Open a GitHub issue in ${finding.repo} for finding ${id}, "${finding.title}", with this body as I left it, then republish the find-improvements view with the issue's link on that card and mark it complete:`,
    "",
    "{draft}",
  ].join("\n");
}

const WASTE_TONE: Record<string, "danger" | "warning" | "info"> = {
  "failed retries": "danger",
  "undelegated context": "warning",
  "large output": "warning",
  "repeated exploration": "info",
};

export function card(finding: Finding, position: number) {
  const id = `finding-${position}`;
  const threads = unique(finding.threads);
  const details = [`**Target:** \`${finding.target}\``, `**Fix:** ${finding.fixType}`];
  if (finding.sources && finding.sources.length > 0) {
    details.push("", "**Based on**", "", ...finding.sources.map((source) => `- [${source.title}](${source.url}), ${source.date}`));
  }
  if (finding.evidence.length > 1) {
    details.push("", "**More evidence**", "", ...finding.evidence.slice(1).map((evidence) => `${quoteLine(evidence)}\n`));
  }
  details.push("", `**Found in:** ${threads.map((thread) => `\`${thread}\``).join(", ")}`);
  const actions: Array<Record<string, unknown>> = [];
  if (finding.repo) {
    actions.push({
      type: "message",
      label: "Open issue",
      detail: `Creates an issue in ${finding.repo} with the text below as its body`,
      text: issueMessage(finding, id),
    });
  }
  const project = finding.project ?? "personal";
  actions.push({
    type: "thread",
    label: "Start PR thread",
    detail: `Starts a thread in ${project} that makes the fix and opens a pull request`,
    project,
    title: `Improve: ${finding.title}`,
    prompt: threadPrompt(finding),
    primary: true,
  });
  // Impromptu UI adds this itself to a card that suggests a change, with a warning each; giving it here keeps publish quiet.
  actions.push({
    type: "message",
    label: "Revise",
    primary: false,
    repeat: true,
    text: `Revise ${id} ("${finding.title}"): {note}\n\nThe text as I left it:\n\n{draft}`,
  });
  return {
    id,
    title: finding.title,
    badges: [
      { label: finding.waste, tone: WASTE_TONE[finding.waste] ?? "neutral" },
      { label: finding.fixType, tone: "neutral" },
      { label: project, tone: "neutral" },
      { label: `${threads.length} thread${threads.length === 1 ? "" : "s"}`, tone: "neutral" },
    ],
    summary: [
      `**${priceLine(finding).replace(/^./, (c) => c.toUpperCase())}**`,
      `**Basis:** ${finding.basis}`,
      finding.evidence[0] ? quoteLine(finding.evidence[0]) : "",
    ]
      .filter((part) => part !== "")
      .join("\n\n"),
    details: details.join("\n"),
    draft: finding.task.trim(),
    draftLabel: finding.repo ? "Issue body and task for the PR thread" : "Task for the PR thread",
    note: { label: "Revise", placeholder: "What to change instead" },
    actions,
  };
}

/** A one-thread finding that saves under this share of what the run analyzed goes under Also seen. */
export const MINOR_SHARE = 0.01;

export function isMinor(finding: Finding, analyzedCost: number | undefined): boolean {
  if (!analyzedCost || unique(finding.threads).length > 1) return false;
  return (finding.estimatedSavings?.cost ?? 0) < analyzedCost * MINOR_SHARE;
}

/** A small finding: what it is and saves, with no buttons. */
function minorItem(finding: Finding, position: number) {
  return {
    id: `also-${position}`,
    title: finding.title,
    badges: [{ label: finding.waste, tone: "neutral" }],
    summary: [`${priceLine(finding).replace(/^./, (c) => c.toUpperCase())}.`, `**Target:** \`${finding.target}\``, `**Basis:** ${finding.basis}`].join("\n\n"),
    details: finding.task.trim(),
    actions: [],
  };
}

/** The view: a card per finding, most cost saved first, small one-thread findings under Also seen, and `summary` on top. */
export function toView(findings: Findings, date: string, summary: string) {
  const major = findings.findings.filter((finding) => !isMinor(finding, findings.threadCost));
  const minor = findings.findings.filter((finding) => isMinor(finding, findings.threadCost));
  const sections: Array<{ title: string; items: unknown[] }> = [];
  if (major.length > 0) sections.push({ title: "Fixes", items: major.map((finding, index) => card(finding, index + 1)) });
  if (minor.length > 0) sections.push({ title: "Also seen", items: minor.map((finding, index) => minorItem(finding, index + 1)) });
  return { title: `Token improvements, ${date}`, summary, sections };
}
