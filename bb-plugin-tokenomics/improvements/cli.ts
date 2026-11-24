// `bb tokenomics improvements collect|price|view|summary`: the steps of the
// tokenomics-find-improvements skill that need no model. The skill's agents
// read what `collect` writes, and `price`, `view`, and `summary` turn their
// findings into cards and a summary. All bb and filesystem access comes in
// through `ImprovementDeps`.
import { addParts, costOf, weightsFor, ZERO_PARTS, type PartRow, type TokenParts, type WeightTable } from "../usage/cost.js";
import {
  cacheHealth,
  cacheSummary,
  cacheText,
  contextRent,
  projectFor,
  rentText,
  startingPrompt,
  startingPromptText,
  usageSince,
  type CacheHealth,
  type ProjectSource,
  type SessionUsage,
  type StartingPrompt,
} from "./analysis.js";
import { callBoundaries, digestText, digestThread, tokensText, type DigestTurn, type LogEvent, type ThreadStats } from "./digest.js";
import { costText, priceAll, toView, validate, type Findings } from "./findings.js";
import { summarize, type Run, type RunGroup } from "./run.js";
import { BATCH_BYTES, DEFAULT_BUDGET, estimate, pack, patternsText, rank, reviewersFor, type Candidate } from "./select.js";

export interface ThreadInfo {
  threadId: string;
  title: string;
  project: string;
  /** The project's checkout, where a repository tool would go. */
  projectPath: string | null;
  /** Where the thread worked, such as a worktree of the project. */
  workPath: string | null;
  origin: string | null;
  provider: string;
  tokens: number;
  subagentTokens: number;
  /** Input-equivalent tokens, subagents included. */
  cost: number;
  subagentCost: number;
  /** The tokens split as providers price them. */
  parts: TokenParts;
  turns: number;
  contextPeak: number;
  /** The context of the thread's first recorded call. */
  firstContext: number | null;
  /** Model calls in the window, and the context they read in all. */
  calls: number;
  contextRead: number;
}

export interface ImprovementDeps {
  now: () => number;
  home: string;
  /** Threads that used tokens since `since`, or exactly `threadIds` when given. */
  threads: (since: number, threadIds: string[] | null) => Promise<ThreadInfo[]>;
  events: (threadId: string) => Promise<LogEvent[]>;
  turns: (threadId: string) => DigestTurn[];
  /** The context after each model response, from Tokenomics' samples. */
  samples: (threadId: string) => Array<{ at: number; usedTokens: number }>;
  /** Every usage row of the thread and its subagents. */
  partRows: (threadId: string) => PartRow[];
  provider: (threadId: string) => string | null;
  /** The latest tokenUsage event's running total for the provider session. One request. */
  session: (threadId: string) => Promise<SessionUsage | null>;
  /** Reads the thread's subagent transcripts again, so the run's own usage is current. */
  refresh: (threadId: string) => Promise<void>;
  costTable: () => Promise<WeightTable>;
  projects: () => Promise<ProjectSource[]>;
  /** The file's real path and size, or null when it does not exist. */
  fileSize: (path: string) => { real: string; bytes: number } | null;
  write: (path: string, text: string) => void;
  read: (path: string) => string;
  makeDir: (path: string) => void;
  exists: (path: string) => boolean;
}

type Result = { exitCode: number; stdout?: string; stderr?: string };

export const IMPROVEMENTS_USAGE = [
  "bb tokenomics improvements collect [--days N | --since TIME] [--thread ID ...] [--budget COST] [--out DIR]",
  "  Picks the threads that cost the most, as many as the budget (default 2M, input-equivalent tokens) pays",
  "  reviewers for, and writes a digest of each one's calls, turn by turn and response by response, with its",
  "  cache health and the outputs later calls paid most to re-read; batches for the reviewers; projects.md with",
  "  each project's starting prompt; and run.json. --since takes an ISO time or HH:MM today. Prints the",
  "  directory on its last line.",
  "bb tokenomics improvements price FINDINGS.json",
  "  Sets each finding's project and repo from its target, checks it, prices the calls it names from",
  "  Tokenomics' turns, and ranks the findings by cost saved.",
  "bb tokenomics improvements view FINDINGS.json",
  "  Prints an Impromptu UI view with one card per finding, for bb impromptu-ui publish --file.",
  "bb tokenomics improvements summary FINDINGS.json",
  "  Prints the run's summary: what was analyzed, cache health, savings if every fix lands, and the run's cost.",
].join("\n");

function flag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function flags(argv: readonly string[], name: string): string[] {
  return argv.flatMap((arg, index) => (arg === name && argv[index + 1] !== undefined ? [argv[index + 1]!] : []));
}

/** `10M`, `2.5m`, `800k`, or a plain number of tokens. */
export function parseTokens(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*([km]?)$/i.exec(text.trim());
  if (match === null) return null;
  const unit = match[2]!.toLowerCase();
  return Math.round(Number(match[1]) * (unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1));
}

/** An ISO time, or `HH:MM` today in local time. */
export function parseSince(text: string, now: number): number | null {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (clock !== null) {
    const date = new Date(now);
    date.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    return date.getTime();
  }
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : at;
}

function day(now: number): string {
  const date = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Digests past this are clipped, so one long thread cannot fill a reviewer alone. */
const THREAD_BYTES = Math.round(BATCH_BYTES * 0.6);

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = Math.round(limit * 0.6);
  const tail = limit - head;
  return `${text.slice(0, head)}\n[… ${text.length - limit} characters of the middle turns cut …]\n${text.slice(-tail)}`;
}

function groups(items: ReadonlyArray<{ key: string; tokens: number; cost: number; weighted?: boolean }>): RunGroup[] {
  const byKey = new Map<string, RunGroup>();
  for (const item of items) {
    const group = byKey.get(item.key) ?? { name: item.key, threads: 0, tokens: 0, cost: 0, ...(item.weighted === undefined ? {} : { weighted: true }) };
    group.threads += 1;
    group.tokens += item.tokens;
    group.cost += item.cost;
    if (item.weighted === false) group.weighted = false;
    byKey.set(item.key, group);
  }
  return [...byKey.values()].sort((a, b) => b.cost - a.cost);
}

/** The instruction files a project's calls carry, by provider, each real file once. */
function instructionFiles(deps: ImprovementDeps, path: string | null, providers: readonly string[]): StartingPrompt["files"] {
  const candidates: string[] = [];
  if (path !== null) candidates.push(`${path}/AGENTS.md`, `${path}/CLAUDE.md`);
  if (providers.includes("claude-code")) candidates.push(`${deps.home}/.claude/CLAUDE.md`);
  if (providers.includes("codex")) candidates.push(`${deps.home}/.codex/AGENTS.md`);
  const seen = new Map<string, string>();
  const files: StartingPrompt["files"] = [];
  for (const candidate of candidates) {
    const found = deps.fileSize(candidate);
    if (found === null) continue;
    const first = seen.get(found.real);
    if (first !== undefined) files.push({ path: candidate, bytes: found.bytes, sameAs: first });
    else {
      seen.set(found.real, candidate);
      files.push({ path: candidate, bytes: found.bytes });
    }
  }
  return files;
}

async function collect(deps: ImprovementDeps, argv: readonly string[], currentThread: string | null): Promise<Result> {
  const now = deps.now();
  const sinceText = flag(argv, "--since");
  const days = Number(flag(argv, "--days") ?? 7);
  let since = now - days * 86_400_000;
  if (sinceText !== undefined) {
    const parsed = parseSince(sinceText, now);
    if (parsed === null) return { exitCode: 1, stderr: "--since takes an ISO time, such as 2026-11-24T06:00, or HH:MM today." };
    since = parsed;
  } else if (!Number.isFinite(days) || days <= 0 || days > 30) {
    return { exitCode: 1, stderr: "--days takes a number from 1 to 30." };
  }
  const budgetText = flag(argv, "--budget");
  const total = budgetText === undefined ? DEFAULT_BUDGET.total : parseTokens(budgetText);
  if (total === null || total <= 0) return { exitCode: 1, stderr: "--budget takes input-equivalent tokens, such as 2M or 800K." };
  const budget = { ...DEFAULT_BUDGET, total };
  const reviewers = reviewersFor(budget);
  const table = await deps.costTable();

  const wanted = flags(argv, "--thread");
  const listed = await deps.threads(since, wanted.length > 0 ? wanted : null);
  const infos = listed.filter((info) => info.threadId !== currentThread && info.tokens > 0);
  const warnings: string[] = [];
  const missing = wanted.filter((id) => !infos.some((info) => info.threadId === id));
  if (missing.length > 0) warnings.push(`warning: no Tokenomics data for ${missing.join(", ")}; left out`);
  if (infos.length === 0) return { exitCode: 1, stderr: [...warnings, "No threads with token use to review."].join("\n") };

  let out = flag(argv, "--out") ?? `/tmp/tokenomics-find-improvements-${day(now)}`;
  if (flag(argv, "--out") === undefined) {
    for (let n = 2; deps.exists(out); n += 1) out = `/tmp/tokenomics-find-improvements-${day(now)}-${n}`;
  }
  deps.makeDir(out);

  const byId = new Map(infos.map((info) => [info.threadId, info]));
  const ranked = rank(infos.map((info): Candidate => info), wanted.length > 0 ? Infinity : undefined);
  const digests: Array<{ info: ThreadInfo; text: string; stats: ThreadStats; health: CacheHealth }> = [];
  // Read logs only for threads that can still fit, about twice what the budget pays for.
  const room = reviewers * BATCH_BYTES * 2;
  let bytes = 0;
  for (const candidate of ranked) {
    if (bytes >= room) break;
    const info = byId.get(candidate.threadId)!;
    const turns = deps.turns(info.threadId);
    const boundaries = callBoundaries(deps.samples(info.threadId));
    const digest = digestThread(await deps.events(info.threadId), turns, boundaries);
    const health = cacheHealth({
      providerId: info.provider,
      rows: deps.partRows(info.threadId),
      turns,
      peak: info.contextPeak,
      session: await deps.session(info.threadId),
    });
    const { weights, weighted } = weightsFor(info.provider, table);
    const p = info.parts;
    const header = [
      `# ${info.threadId}: ${info.title}`,
      `Project: ${info.project}${info.projectPath ? ` (${info.projectPath})` : ""}${info.workPath && info.workPath !== info.projectPath ? `; worked in ${info.workPath}` : ""}`,
      `Started by: ${info.origin ?? "the user"}; provider ${info.provider}${weighted ? "" : " (unweighted)"}`,
      `Cost: ${costText(info)} in ${turns.length} turns, ${boundaries.length} model calls; subagents ${costText({ cost: info.subagentCost, tokens: info.subagentTokens })}; peak context ${tokensText(info.contextPeak)}`,
      `Tokens: ${tokensText(p.input)} uncached input, ${tokensText(p.cacheWrite)} cache writes, ${tokensText(p.cacheRead)} cache reads, ${tokensText(p.output)} output`,
      ...cacheText(health),
      ...rentText(contextRent(digest.calls, boundaries), weights.cacheRead),
    ].join("\n");
    const text = clip(digestText(header, turns, digest, boundaries), THREAD_BYTES);
    digests.push({ info, text, stats: digest.stats, health });
    bytes += text.length;
  }

  // Keep a project's threads together, so one reviewer sees their shared exploration.
  const order = [...digests].sort((a, b) => a.info.project.localeCompare(b.info.project) || b.info.cost - a.info.cost);
  const { batches, left } = pack(order.map((d) => ({ id: d.info.threadId, bytes: d.text.length })), reviewers);
  const picked = order.filter((d) => batches.has(d.info.threadId));
  const batchCount = Math.max(0, ...batches.values());

  for (const d of picked) deps.write(`${out}/${d.info.threadId}.md`, d.text);
  for (let n = 1; n <= batchCount; n += 1) {
    const lines = picked
      .filter((d) => batches.get(d.info.threadId) === n)
      .map((d) => `- ${d.info.threadId} (${d.info.project}, started by ${d.info.origin ?? "the user"}, ${costText(d.info)}): ${d.info.title}`);
    deps.write(`${out}/batch-${n}.md`, `${lines.join("\n")}\n`);
  }
  deps.write(
    `${out}/patterns.md`,
    patternsText(picked.map((d) => ({ threadId: d.info.threadId, project: d.info.project, title: d.info.title, tokens: d.info.tokens, cost: d.info.cost, stats: d.stats }))),
  );

  // Each picked project's starting prompt, from every thread of it in the window.
  const projectPaths = new Map<string, string | null>();
  for (const d of picked) if (!projectPaths.has(d.info.project)) projectPaths.set(d.info.project, d.info.projectPath);
  const prompts: StartingPrompt[] = [...projectPaths].map(([name, path]) => {
    const threads = infos.filter((info) => info.project === name);
    const numbers = startingPrompt(name, path, threads);
    const provider = numbers.providers[0] ?? "claude-code";
    return { ...numbers, files: instructionFiles(deps, path, numbers.providers), readWeight: weightsFor(provider, table).weights.cacheRead };
  });
  deps.write(`${out}/projects.md`, startingPromptText(prompts));

  const index = [
    "selected\tbatch\tthread\tproject\torigin\tprovider\tcost\ttokens\tsubagent tokens\tturns\ttitle",
    ...ranked.map((c) => {
      const info = byId.get(c.threadId)!;
      const batch = batches.get(c.threadId);
      return [batch ? "yes" : "no", batch ?? "-", info.threadId, info.project, info.origin ?? "-", info.provider, info.cost, info.tokens, info.subagentTokens, info.turns, info.title.replace(/\t/g, " ")].join("\t");
    }),
  ];
  deps.write(`${out}/index.tsv`, `${index.join("\n")}\n`);

  const pickedTokens = picked.reduce((sum, d) => sum + d.info.tokens, 0);
  const pickedCost = picked.reduce((sum, d) => sum + d.info.cost, 0);
  const cache = cacheSummary(picked.map((d) => ({ health: d.health, peak: d.info.contextPeak })));
  const run: Run = {
    out,
    startedAt: now,
    since: wanted.length > 0 ? null : since,
    windowDays: wanted.length > 0 ? null : (now - since) / 86_400_000,
    budget: total,
    threadIds: picked.map((d) => d.info.threadId),
    threadCount: picked.length,
    tokens: pickedTokens,
    cost: pickedCost,
    parts: picked.reduce((sum, d) => addParts(sum, d.info.parts), ZERO_PARTS),
    byProject: groups(picked.map((d) => ({ key: d.info.project, tokens: d.info.tokens, cost: d.info.cost }))),
    byProvider: groups(picked.map((d) => ({ key: d.info.provider, tokens: d.info.tokens, cost: d.info.cost, weighted: weightsFor(d.info.provider, table).weighted }))),
    cache,
  };
  deps.write(`${out}/run.json`, `${JSON.stringify(run, null, 2)}\n`);

  if (left.length > 0) warnings.push(`${left.length} threads did not fit the budget's ${reviewers} reviewers; raise --budget to read them`);
  return {
    exitCode: 0,
    stdout: [
      ...warnings,
      `${infos.length} threads scored; ${picked.length} selected (${costText({ cost: pickedCost, tokens: pickedTokens })}) in ${batchCount} batches.`,
      cache,
      `Estimate: ${batchCount} batch reviewers + 1 research reviewer + this thread, about ${tokensText(estimate(budget, batchCount))} of the ${tokensText(total)} budget (input-equivalent tokens).`,
      out,
    ].join("\n"),
  };
}

function load(deps: ImprovementDeps, path: string | undefined): Findings | Result {
  if (path === undefined) return { exitCode: 1, stderr: "Give the path to findings.json." };
  try {
    return JSON.parse(deps.read(path)) as Findings;
  } catch (error) {
    return { exitCode: 1, stderr: `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash <= 0 ? "." : path.slice(0, slash);
}

/** The run.json `collect` wrote beside findings.json. */
function loadRun(deps: ImprovementDeps, findingsPath: string): Run | Result {
  const path = `${dirOf(findingsPath)}/run.json`;
  try {
    return JSON.parse(deps.read(path)) as Run;
  } catch (error) {
    return { exitCode: 1, stderr: `Could not read ${path}, which collect writes beside findings.json: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** What the thread running the skill has used since the run started, subagents included. */
async function runUsage(deps: ImprovementDeps, threadId: string | null, since: number, table: WeightTable): Promise<{ tokens: number; cost: number } | null> {
  if (threadId === null) return null;
  await deps.refresh(threadId);
  const used = usageSince(deps.partRows(threadId), callBoundaries(deps.samples(threadId)), since, deps.provider(threadId) ?? "claude-code", table);
  return { tokens: used.tokens, cost: used.cost };
}

export async function improvementsCli(deps: ImprovementDeps, argv: readonly string[], currentThread: string | null): Promise<Result> {
  const [sub, ...rest] = argv;
  if (sub === undefined || sub === "help") return { exitCode: 0, stdout: IMPROVEMENTS_USAGE };
  if (sub === "collect") return collect(deps, rest, currentThread);
  if (sub === "price" || sub === "view" || sub === "summary") {
    const path = rest.find((arg) => !arg.startsWith("--"));
    const findings = load(deps, path);
    if ("exitCode" in findings) return findings;
    const run = loadRun(deps, path!);
    if ("exitCode" in run) return run;
    const table = await deps.costTable();
    if (sub === "price") {
      findings.threadCount = run.threadCount;
      findings.threadTokens = run.tokens;
      findings.threadCost = run.cost;
      const projects = await deps.projects();
      for (const finding of findings.findings ?? []) {
        if (typeof finding.target !== "string") continue;
        const { project, repo } = projectFor(finding.target, projects);
        finding.project = project;
        finding.repo = repo;
      }
    }
    const problems = validate(findings);
    if (problems.length > 0) return { exitCode: 1, stderr: `Fix findings.json first:\n${problems.map((p) => `- ${p}`).join("\n")}` };
    if (sub === "price") {
      const lines = priceAll(findings, (threadId) => ({
        turns: deps.turns(threadId),
        readWeight: weightsFor(deps.provider(threadId) ?? "claude-code", table).weights.cacheRead,
      }));
      deps.write(path!, `${JSON.stringify(findings, null, 2)}\n`);
      return { exitCode: 0, stdout: lines.join("\n") };
    }
    findings.runTokens = (await runUsage(deps, currentThread, run.startedAt, table)) ?? findings.runTokens ?? null;
    deps.write(path!, `${JSON.stringify(findings, null, 2)}\n`);
    const summary = summarize(findings, run);
    if (sub === "summary") return { exitCode: 0, stdout: summary };
    return { exitCode: 0, stdout: JSON.stringify(toView(findings, day(deps.now()), summary), null, 1) };
  }
  return { exitCode: 1, stderr: `Unknown improvements command "${sub}".\n\n${IMPROVEMENTS_USAGE}` };
}
