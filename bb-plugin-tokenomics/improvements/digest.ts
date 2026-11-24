// A thread's calls, turn by turn, as the text a find-improvements reviewer
// reads. Pure: the inputs are the thread's event log and Tokenomics' own turn
// summaries, so it can be tested without bb.
import { commandKey } from "../usage/report.js";

/** One event from `bb.sdk.threads.events.list`, as much of it as the digest reads. */
export interface LogEvent {
  type: string;
  createdAt: number;
  data?: unknown;
}

/** A turn as Tokenomics counts it: when it started and ended, its model calls, tokens, and cost. */
export interface DigestTurn {
  startedAt: number;
  endedAt: number | null;
  calls: number;
  /** Every token the turn used, its subagents' included. */
  tokens: number;
  subagentTokens: number;
  /** Input-equivalent tokens (see usage/cost.ts), its subagents' included. */
  cost: number;
  subagentCost: number;
  /** Tokens the thread itself wrote to the prompt cache in the turn. */
  cacheWrite: number;
}

/** One model response: when bb first recorded its context, numbered from 1 in the thread. */
export interface Boundary {
  call: number;
  at: number;
  /** The context the response read and wrote, in tokens. */
  context: number;
}

/**
 * The thread's model responses, from Tokenomics' context samples. bb records
 * the context several times per response, at the response's item events, so
 * a response starts where the size first changes.
 */
export function callBoundaries(samples: ReadonlyArray<{ at: number; usedTokens: number }>): Boundary[] {
  const boundaries: Boundary[] = [];
  for (const sample of [...samples].sort((a, b) => a.at - b.at)) {
    if (boundaries.at(-1)?.context === sample.usedTokens) continue;
    boundaries.push({ call: boundaries.length + 1, at: sample.at, context: sample.usedTokens });
  }
  return boundaries;
}

/** The response that made an item started at `at`: the last one recorded at or before it. */
function callAt(boundaries: readonly Boundary[], at: number): Boundary | null {
  let found: Boundary | null = null;
  for (const boundary of boundaries) {
    if (boundary.at > at) break;
    found = boundary;
  }
  return found;
}

export interface Call {
  /** Index of the turn it ran in, from 0. */
  turn: number;
  kind: "command" | "tool" | "read" | "edit" | "subagent" | "say" | "ask";
  /** The command line, tool and its argument, path, or message text, on one line. */
  text: string;
  /** What kind of command it is, such as `gh pr`, from the whole command; empty for other calls. */
  key: string;
  /** Lines in a command, when it has more than one. */
  lines: number;
  exitCode: number | null;
  outputBytes: number;
  ms: number | null;
  /** Files a read-like command names, from the whole command. */
  files?: string[];
  /** When it started, or completed when its start is not in the log. */
  startedAt?: number;
  /** When its output reached the context. */
  completedAt?: number;
  /** The model response that made it, from the thread's call boundaries; null when unknown. */
  call?: number | null;
}

export interface ThreadDigest {
  calls: Call[];
  /** What the user (or the spawning plugin) sent to start each turn, by turn index. */
  requests: string[];
  stats: ThreadStats;
}

export interface ThreadStats {
  commands: number;
  failed: number;
  reads: number;
  edits: number;
  tools: number;
  subagents: number;
  /** Total bytes of command and tool output read into context. */
  outputBytes: number;
  /** Command kinds, such as `gh pr` or `npm test`, and how often each ran. */
  commandKinds: Map<string, number>;
  /** Command kinds that failed, and how often. */
  failedKinds: Map<string, number>;
  /** Exact commands run three or more times. */
  repeated: Array<[string, number]>;
  /** Files read three or more times. */
  reread: Array<[string, number]>;
  /** Skills the thread loaded. */
  skills: string[];
  /** Files the thread read, for spotting the same exploration across threads. */
  filesRead: Set<string>;
}

const TEXT_CHARS = 160;
const SAY_CHARS = 220;
const REQUEST_CHARS = 600;
/** Output at or past this is marked, since it was read into context in full. */
export const LARGE_OUTPUT = 10_000;
/** Calls listed per turn; the rest of a long turn is summarized in one line. */
const CALLS_PER_TURN = 120;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function oneLine(text: string, limit: number): string {
  const flat = text.split(/\s+/).filter(Boolean).join(" ");
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/** The turn a moment falls in: the last turn that started at or before it. */
function turnAt(turns: readonly DigestTurn[], at: number): number {
  let index = 0;
  for (let i = 0; i < turns.length; i += 1) {
    if (turns[i]!.startedAt <= at) index = i;
  }
  return index;
}

/** The files a read-like command names, such as `sed -n 1,80p a.ts` or `cat a.ts b.ts`. */
export function filesOf(command: string): string[] {
  const files: string[] = [];
  for (const part of command.split(/&&|\|\||;|\n|\|/)) {
    const words = part.trim().split(/\s+/);
    const head = words[0]?.split("/").at(-1);
    if (head === undefined || !["cat", "sed", "head", "tail", "less", "nl"].includes(head)) continue;
    for (const word of words.slice(1)) {
      if (word.startsWith("-") || /^\d+(,\d+)?p$/.test(word) || /^\d+$/.test(word)) continue;
      if (/[./]/.test(word) && !/[<>$`'"]/.test(word)) files.push(word);
    }
  }
  return files;
}

function callOf(item: Record<string, unknown>, turn: number, ms: number | null): Call | null {
  const type = str(item.type);
  const base = { turn, key: "", lines: 1, exitCode: null, outputBytes: 0, ms };
  if (type === "commandExecution") {
    const command = str(item.command);
    const label = str(record(record(item.presentation).label).completed);
    const read = /^Explored|^Read/.test(label);
    return {
      ...base,
      kind: read ? "read" : "command",
      text: oneLine(command.split("\n")[0] ?? "", TEXT_CHARS),
      key: commandKey(command),
      files: filesOf(command),
      lines: command.split("\n").length,
      exitCode: typeof item.exitCode === "number" ? item.exitCode : null,
      outputBytes: str(item.aggregatedOutput).length,
    };
  }
  if (type === "fileRead") return { ...base, kind: "read", text: str(item.path) };
  if (type === "fileChange") {
    const paths = (Array.isArray(item.changes) ? item.changes : []).map((change) => str(record(change).path));
    return { ...base, kind: "edit", text: oneLine(paths.join(", "), TEXT_CHARS) };
  }
  if (type === "delegation") {
    const text = str(item.description) || str(item.prompt) || str(item.title);
    return { ...base, kind: "subagent", text: oneLine(text, TEXT_CHARS) };
  }
  if (type === "toolCall") {
    const tool = str(item.tool);
    const args = record(item.arguments);
    if (tool === "Agent" || tool === "Task") {
      return { ...base, kind: "subagent", text: oneLine(str(args.description) || str(args.prompt), TEXT_CHARS) };
    }
    if (tool === "Read") return { ...base, kind: "read", text: str(args.file_path), outputBytes: str(item.result).length };
    if (tool === "AskUserQuestion") return { ...base, kind: "ask", text: "asked the user a question" };
    const detail = str(args.skill) || str(args.file_path) || str(args.pattern) || str(args.query) || str(args.url);
    return {
      ...base,
      kind: "tool",
      text: oneLine(detail === "" ? tool : `${tool} ${detail}`, TEXT_CHARS),
      outputBytes: str(item.result).length,
    };
  }
  if (type === "agentMessage") return { ...base, kind: "say", text: oneLine(str(item.text), SAY_CHARS) };
  return null;
}

/**
 * The calls in a thread's event log, each placed in the turn it ran in and,
 * given the thread's call boundaries, the model response that made it.
 */
export function digestThread(
  events: readonly LogEvent[],
  turns: readonly DigestTurn[],
  boundaries: readonly Boundary[] = [],
): ThreadDigest {
  const started = new Map<string, number>();
  for (const event of events) {
    if (event.type !== "item/started") continue;
    const id = str(record(record(event.data).item).id);
    if (id !== "" && !started.has(id)) started.set(id, event.createdAt);
  }
  const calls: Call[] = [];
  const requests: string[] = turns.map(() => "");
  for (const event of events) {
    if (event.type === "client/turn/requested") {
      const input = record(event.data).input;
      const text = (Array.isArray(input) ? input : []).map((part) => str(record(part).text)).join(" ");
      // The request lands just before its turn starts, so it belongs to the next turn.
      const index = turns.findIndex((turn) => turn.startedAt >= event.createdAt);
      const turn = index === -1 ? turns.length - 1 : index;
      if (turn >= 0 && requests[turn] === "") requests[turn] = oneLine(text, REQUEST_CHARS);
      continue;
    }
    if (event.type !== "item/completed") continue;
    const item = record(record(event.data).item);
    const begin = started.get(str(item.id));
    const call = callOf(item, turnAt(turns, event.createdAt), begin === undefined ? null : event.createdAt - begin);
    if (call === null) continue;
    call.completedAt = event.createdAt;
    call.startedAt = begin ?? event.createdAt;
    if (boundaries.length > 0) call.call = callAt(boundaries, begin ?? event.createdAt)?.call ?? null;
    calls.push(call);
  }
  // In the order they started, so each response's calls sit together under it.
  calls.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
  return { calls, requests, stats: statsOf(calls) };
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function atLeast(map: Map<string, number>, n: number): Array<[string, number]> {
  return [...map].filter(([, count]) => count >= n).sort((a, b) => b[1] - a[1]);
}

export function statsOf(calls: readonly Call[]): ThreadStats {
  const commandKinds = new Map<string, number>();
  const failedKinds = new Map<string, number>();
  const exact = new Map<string, number>();
  const reads = new Map<string, number>();
  const skills: string[] = [];
  let outputBytes = 0;
  const count = { commands: 0, failed: 0, reads: 0, edits: 0, tools: 0, subagents: 0 };
  for (const call of calls) {
    outputBytes += call.outputBytes;
    if (call.kind === "command") {
      count.commands += 1;
      const kind = call.key;
      if (kind !== "") bump(commandKinds, kind);
      bump(exact, call.text);
      if (call.exitCode !== null && call.exitCode !== 0) {
        count.failed += 1;
        if (kind !== "") bump(failedKinds, kind);
      }
      for (const file of call.files ?? []) bump(reads, file);
    } else if (call.kind === "read") {
      count.reads += 1;
      const files = filesOf(call.text);
      for (const file of files.length > 0 ? files : [call.text]) bump(reads, file);
    } else if (call.kind === "edit") count.edits += 1;
    else if (call.kind === "subagent") count.subagents += 1;
    else if (call.kind === "tool") {
      count.tools += 1;
      if (call.text.startsWith("Skill ")) skills.push(call.text.slice("Skill ".length));
    }
  }
  return {
    ...count,
    outputBytes,
    commandKinds,
    failedKinds,
    repeated: atLeast(exact, 3),
    reread: atLeast(reads, 3),
    skills,
    filesRead: new Set(reads.keys()),
  };
}

export function bytesText(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}KB`;
  return `${n}B`;
}

export function tokensText(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

export function msText(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const MARK: Record<Call["kind"], string> = {
  command: "$",
  read: "read",
  edit: "edit",
  tool: "tool",
  subagent: "subagent",
  say: "said",
  ask: "ask",
};

function callLine(call: Call): string {
  const notes: string[] = [];
  if (call.lines > 1) notes.push(`${call.lines} lines`);
  if (call.exitCode !== null && call.exitCode !== 0) notes.push(`exit ${call.exitCode}`);
  if (call.outputBytes >= 2_000) notes.push(`${bytesText(call.outputBytes)} out${call.outputBytes >= LARGE_OUTPUT ? " LARGE" : ""}`);
  if (call.ms !== null && call.ms >= 60_000) notes.push(msText(call.ms));
  return `  ${MARK[call.kind]} ${call.text}${notes.length > 0 ? `  [${notes.join(", ")}]` : ""}`;
}

/**
 * The reviewer's view of one thread: a header, then each turn with its
 * numbers, the message that started it, and its calls in order. Findings
 * cite turns by the numbers here.
 */
export function digestText(
  header: string,
  turns: readonly DigestTurn[],
  digest: ThreadDigest,
  boundaries: readonly Boundary[] = [],
): string {
  const s = digest.stats;
  const contextOf = new Map(boundaries.map((boundary) => [boundary.call, boundary.context]));
  const lines = [
    header,
    `Calls: ${s.commands} commands (${s.failed} failed), ${s.reads} reads, ${s.edits} edits, ${s.subagents} subagents, ${s.tools} other tools; ${bytesText(s.outputBytes)} of output read into context`,
  ];
  if (s.skills.length > 0) lines.push(`Skills loaded: ${s.skills.join(", ")}`);
  if (s.repeated.length > 0) lines.push(`Run 3+ times: ${s.repeated.slice(0, 6).map(([text, n]) => `${n}x \`${text}\``).join("; ")}`);
  if (s.reread.length > 0) lines.push(`Read 3+ times: ${s.reread.slice(0, 6).map(([path, n]) => `${n}x ${path}`).join("; ")}`);
  lines.push("");
  turns.forEach((turn, index) => {
    const end = turn.endedAt === null ? "" : `, ${msText(turn.endedAt - turn.startedAt)}`;
    const subagents = turn.subagentTokens > 0 ? `, subagents ${tokensText(turn.subagentTokens)} (cost ${tokensText(turn.subagentCost)})` : "";
    const own = turn.tokens - turn.subagentTokens;
    const perCall = turn.calls > 0 && own > 0 ? `, ${tokensText(own / turn.calls)} context per call` : "";
    lines.push(
      `## Turn ${index + 1}: ${turn.calls} model calls, ${tokensText(turn.tokens)} tokens (cost ${tokensText(turn.cost)})${perCall}${subagents}${end}`,
    );
    const request = digest.requests[index];
    if (request) lines.push(`> ${request}`);
    const inTurn = digest.calls.filter((call) => call.turn === index);
    let shown: number | null | undefined;
    for (const call of inTurn.slice(0, CALLS_PER_TURN)) {
      if (call.call != null && call.call !== shown) {
        const context = contextOf.get(call.call);
        lines.push(`  · call ${call.call}${context === undefined ? "" : ` (context ${tokensText(context)})`}`);
      }
      shown = call.call;
      lines.push(callLine(call));
    }
    if (inTurn.length > CALLS_PER_TURN) {
      const rest = inTurn.slice(CALLS_PER_TURN);
      const failed = rest.filter((call) => call.exitCode !== null && call.exitCode !== 0).length;
      lines.push(`  … ${rest.length} more calls (${failed} failed, ${bytesText(rest.reduce((sum, call) => sum + call.outputBytes, 0))} of output)`);
    }
    lines.push("");
  });
  return lines.join("\n");
}
