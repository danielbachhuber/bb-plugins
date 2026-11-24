import { describe, expect, it } from "vitest";

import { callBoundaries, digestText, digestThread, filesOf, type DigestTurn, type LogEvent } from "./digest.js";
import { price, priceAll, toView, validate, type Finding, type Findings, type PricedThread } from "./findings.js";
import { pack, rank, reviewersFor, DEFAULT_BUDGET, patternsText } from "./select.js";
import { parseSince, parseTokens } from "./cli.js";
import { cacheHealth, cacheText, contextRent, projectFor, repoOf, startingPrompt, startingPromptText, usageSince } from "./analysis.js";
import { combinedSavings, summarize, type Run } from "./run.js";
import type { PartRow } from "../usage/cost.js";

const turns: DigestTurn[] = [
  { startedAt: 1_000, endedAt: 61_000, calls: 10, tokens: 1_000_000, subagentTokens: 0, cost: 150_000, subagentCost: 0, cacheWrite: 40_000 },
  { startedAt: 100_000, endedAt: 130_000, calls: 4, tokens: 600_000, subagentTokens: 200_000, cost: 90_000, subagentCost: 30_000, cacheWrite: 5_000 },
];
const thread = (): PricedThread => ({ turns, readWeight: 0.1 });

function item(at: number, item: Record<string, unknown>): LogEvent[] {
  return [
    { type: "item/started", createdAt: at - 500, data: { item: { id: item.id } } },
    { type: "item/completed", createdAt: at, data: { item } },
  ];
}

const events: LogEvent[] = [
  { type: "client/turn/requested", createdAt: 900, data: { input: [{ type: "text", text: "Rename widgets.get to widgets.all" }] } },
  ...item(2_000, { id: "a", type: "commandExecution", command: "cat src/widgets.ts src/gadgets.ts", exitCode: 0, aggregatedOutput: "x".repeat(12_000) }),
  ...item(3_000, { id: "b", type: "commandExecution", command: "npm tset", exitCode: 1, aggregatedOutput: "" }),
  ...item(4_000, { id: "c", type: "toolCall", tool: "Skill", arguments: { skill: "work-on" }, result: "ok" }),
  ...item(5_000, { id: "d", type: "agentMessage", text: "Now the edits." }),
  { type: "client/turn/requested", createdAt: 99_000, data: { input: [{ type: "text", text: "Run the tests" }] } },
  ...item(101_000, { id: "e", type: "commandExecution", command: "python3 - <<'EOF'\nprint(1)\nEOF", exitCode: 0, aggregatedOutput: "1" }),
  ...item(102_000, { id: "f", type: "toolCall", tool: "Agent", arguments: { description: "Find callers" }, result: "" }),
];

describe("digestThread", () => {
  const digest = digestThread(events, turns);

  it("places each call in the turn it ran in, with the request that started the turn", () => {
    expect(digest.calls.filter((call) => call.turn === 0).map((call) => call.kind)).toEqual(["command", "command", "tool", "say"]);
    expect(digest.calls.filter((call) => call.turn === 1).map((call) => call.kind)).toEqual(["command", "subagent"]);
    expect(digest.requests).toEqual(["Rename widgets.get to widgets.all", "Run the tests"]);
  });

  it("counts failures, output, skills, and the files a command reads", () => {
    expect(digest.stats).toMatchObject({ commands: 3, failed: 1, subagents: 1, skills: ["work-on"] });
    expect([...digest.stats.failedKinds]).toEqual([["npm tset", 1]]);
    expect(digest.stats.filesRead).toEqual(new Set(["src/widgets.ts", "src/gadgets.ts"]));
  });

  it("writes each turn with its numbers and marks large, failed, and multi-line calls", () => {
    const text = digestText("# thr_1: Rename", turns, digest);
    expect(text).toContain("## Turn 1: 10 model calls, 1M tokens (cost 150K), 100K context per call, 1 min");
    expect(text).toContain("## Turn 2: 4 model calls, 600K tokens (cost 90K), 100K context per call, subagents 200K (cost 30K), 30s");
    expect(text).toContain("$ cat src/widgets.ts src/gadgets.ts  [12.0KB out LARGE]");
    expect(text).toContain("$ npm tset  [exit 1]");
    expect(text).toContain("$ python3 - <<'EOF'  [3 lines]");
    expect(text).toContain("> Run the tests");
  });
});

describe("filesOf", () => {
  it("takes paths from read-like commands and skips line ranges and flags", () => {
    expect(filesOf("sed -n 1,80p src/a.ts; grep -n x src/b.ts | head -5")).toEqual(["src/a.ts"]);
    expect(filesOf("cat -n docs/x.md")).toEqual(["docs/x.md"]);
  });
});

describe("selection", () => {
  it("pays for as many reviewers as the budget leaves after the main thread and research", () => {
    expect(reviewersFor(DEFAULT_BUDGET)).toBe(4);
    expect(reviewersFor({ ...DEFAULT_BUDGET, total: 1_000_000 })).toBe(1);
  });

  it("ranks by cost, not raw tokens, and keeps at most two threads per plugin", () => {
    const base = { subagentTokens: 0, subagentCost: 0, turns: 1, contextPeak: 0, tokens: 1 };
    const ranked = rank([
      { threadId: "a", origin: "pr-sweep", cost: 9, ...base },
      { threadId: "b", origin: "pr-sweep", cost: 8, ...base },
      { threadId: "c", origin: "pr-sweep", cost: 7, ...base },
      { threadId: "d", origin: null, cost: 1, ...base },
      { threadId: "e", origin: null, cost: 2, ...base, tokens: 99 },
    ]);
    expect(ranked.map((c) => c.threadId)).toEqual(["a", "b", "e", "d"]);
  });

  it("packs digests into the reviewers it has and leaves out what does not fit", () => {
    const { batches, left } = pack([{ id: "a", bytes: 60 }, { id: "b", bytes: 60 }, { id: "c", bytes: 30 }], 2, 100);
    expect([...batches]).toEqual([["a", 1], ["b", 2], ["c", 1]]);
    expect(left).toEqual([]);
    expect(pack([{ id: "a", bytes: 90 }, { id: "b", bytes: 90 }], 1, 100).left).toEqual(["b"]);
  });

  it("lists files two threads of a project both read", () => {
    const stats = digestThread(events, turns).stats;
    const text = patternsText([
      { threadId: "t1", project: "Acme", title: "one", tokens: 1, cost: 1, stats },
      { threadId: "t2", project: "Acme", title: "two", tokens: 1, cost: 1, stats },
    ]);
    expect(text).toContain("- src/widgets.ts: 2 threads (t1, t2)");
  });
});

const finding: Finding = {
  title: "Add a script that lists a procedure's callers",
  waste: "repeated exploration",
  fixType: "repository tool",
  target: "/repo/scripts/callers.ts",
  project: "Acme",
  repo: "acme/widgets",
  threads: ["thr_1"],
  removes: [{ threadId: "thr_1", turn: 1, calls: 5, removed: 4 }],
  basis: "one command replaces the greps",
  evidence: [{ quote: "$ grep -rn widgets.get", threadId: "thr_1", turn: 1 }],
  task: "Add scripts/callers.ts.\n\nDone is:\n- It prints every caller",
};

describe("pricing", () => {
  it("spreads a turn's own tokens and cost over its calls, and counts subagents only for a whole turn", () => {
    const part = price([{ threadId: "thr_1", turn: 2, calls: 2 }], thread);
    expect(part.cost).toEqual({ tokens: 200_000, cost: 30_000, ms: 15_000, threads: 1 });
    const whole = price([{ threadId: "thr_1", turn: 2 }], thread);
    expect(whole.cost).toMatchObject({ tokens: 600_000, cost: 90_000 });
    expect(price([{ threadId: "thr_1", turn: 9 }], thread).problems).toEqual(["thr_1: no data for turn 9"]);
  });

  it("prices a context cut as that many cache reads on every call of the turn, or of the thread", () => {
    const turn = price([{ threadId: "thr_1", turn: 1, contextCut: 5_000 }], thread);
    expect(turn.savings).toEqual({ tokens: 50_000, cost: 5_000, ms: 0 });
    expect(turn.byTurn).toEqual([{ threadId: "thr_1", turn: 1, tokens: 50_000, cost: 5_000, capTokens: 1_000_000, capCost: 150_000 }]);
    const all = price([{ threadId: "thr_1", contextCut: 5_000 }], thread);
    expect(all.savings).toMatchObject({ tokens: 70_000, cost: 7_000 });
  });

  it("ranks findings by cost saved", () => {
    const findings: Findings = {
      threadCount: 1,
      findings: [finding, { ...finding, title: "Bigger", removes: [{ threadId: "thr_1", turn: 1 }] }],
    };
    const lines = priceAll(findings, thread);
    expect(findings.findings.map((f) => f.title)).toEqual(["Bigger", finding.title]);
    expect(lines[0]).toBe("1. Bigger: 150K cost (1M tokens), 1 min across 1 thread; saves about 150K cost (1M tokens), 1 min");
  });
});

describe("validate", () => {
  it("takes removed or contextCut on an entry, not both", () => {
    const both = { ...finding, removes: [{ threadId: "thr_1", turn: 1, removed: 2, contextCut: 100 }] };
    expect(validate({ threadCount: 1, findings: [both] })).toEqual([
      `finding 1 (${finding.title}): removes[0] has both removed and contextCut; give one, or neither for the whole turn`,
    ]);
    expect(validate({ threadCount: 1, findings: [{ ...finding, removes: [{ threadId: "thr_1", contextCut: 100 }] }] })).toEqual([]);
  });

  it("asks for an absolute target, removes, and a Done is list", () => {
    expect(validate({ threadCount: 1, findings: [finding] })).toEqual([]);
    const problems = validate({ threadCount: 1, findings: [{ ...finding, target: "scripts/x.ts", removes: [], task: "Do it" }] });
    expect(problems).toEqual([
      `finding 1 (${finding.title}): target must be an absolute path`,
      `finding 1 (${finding.title}): removes is empty, so it cannot be priced`,
      `finding 1 (${finding.title}): task has no "Done is:" list`,
    ]);
  });
});

describe("toView", () => {
  type Card = ReturnType<typeof import("./findings.js").card>;

  it("gives a card Open issue only when it has a repository, Start PR thread, and its own Revise note", () => {
    const view = toView({ threadCount: 1, findings: [finding, { ...finding, repo: null }] }, "2026-11-24", "summary");
    const [withRepo, without] = view.sections[0]!.items as Card[];
    expect(withRepo!.actions.map((a) => a.label)).toEqual(["Open issue", "Start PR thread", "Revise"]);
    expect(without!.actions.map((a) => a.label)).toEqual(["Start PR thread", "Revise"]);
    expect(withRepo!.actions[1]).toMatchObject({ type: "thread", project: "Acme", title: `Improve: ${finding.title}` });
    expect(String(withRepo!.actions[1]!.prompt)).toContain("@thread:thr_1");
    expect(String(withRepo!.actions[2]!.text)).toContain("{note}");
    expect(withRepo!.note).toEqual({ label: "Revise", placeholder: "What to change instead" });
    expect(withRepo!.draft).toBe(finding.task);
    expect(view.summary).toBe("summary");
  });

  it("puts a one-thread finding that saves under 1% of the analyzed cost under Also seen, without buttons", () => {
    const small = { ...finding, title: "Small", estimatedSavings: { tokens: 10, cost: 1, ms: 0 }, totalCost: { tokens: 10, cost: 1, ms: 0, threads: 1 } };
    const big = { ...finding, estimatedSavings: { tokens: 1_000, cost: 500, ms: 0 }, totalCost: { tokens: 1_000, cost: 500, ms: 0, threads: 1 } };
    const view = toView({ threadCount: 1, threadCost: 1_000, findings: [big, small] }, "2026-11-24", "");
    expect(view.sections.map((section) => section.title)).toEqual(["Fixes", "Also seen"]);
    expect(view.sections[1]!.items).toEqual([expect.objectContaining({ title: "Small", actions: [] })]);
  });
});

describe("parsing", () => {
  it("reads budgets and times", () => {
    expect(parseTokens("10M")).toBe(10_000_000);
    expect(parseTokens("800k")).toBe(800_000);
    expect(parseTokens("lots")).toBeNull();
    const now = new Date(2026, 10, 24, 9, 0).getTime();
    expect(parseSince("03:00", now)).toBe(new Date(2026, 10, 24, 3, 0).getTime());
  });
});

describe("call boundaries", () => {
  // bb samples the context at each of a response's item events, so a size repeats.
  const samples = [
    { at: 1_500, usedTokens: 50_000 },
    { at: 1_900, usedTokens: 50_000 },
    { at: 2_400, usedTokens: 62_000 },
    { at: 2_700, usedTokens: 62_000 },
    { at: 4_200, usedTokens: 63_000 },
  ];

  it("numbers each response where the context size first changes", () => {
    expect(callBoundaries(samples)).toEqual([
      { call: 1, at: 1_500, context: 50_000 },
      { call: 2, at: 2_400, context: 62_000 },
      { call: 3, at: 4_200, context: 63_000 },
    ]);
  });

  it("marks the response that made each call in the digest", () => {
    const boundaries = callBoundaries(samples);
    const digest = digestThread(events, turns, boundaries);
    expect(digest.calls.filter((call) => call.turn === 0).map((call) => call.call)).toEqual([1, 2, 2, 3]);
    const text = digestText("# thr_1", turns, digest, boundaries);
    expect(text).toContain("  · call 1 (context 50K)\n  $ cat src/widgets.ts src/gadgets.ts");
    expect(text).toContain("  · call 2 (context 62K)\n  $ npm tset  [exit 1]\n  tool Skill work-on\n  · call 3 (context 63K)");
  });
});

describe("context rent", () => {
  it("charges each output for every later call that re-read it, until the context was compacted", () => {
    const boundaries = callBoundaries([
      { at: 1_000, usedTokens: 10_000 },
      { at: 3_000, usedTokens: 13_000 },
      { at: 4_000, usedTokens: 14_000 },
      { at: 5_000, usedTokens: 15_000 },
      { at: 6_000, usedTokens: 4_000 }, // compacted
      { at: 7_000, usedTokens: 5_000 },
    ]);
    const digest = digestThread(events, turns, boundaries);
    const [top] = contextRent(digest.calls, boundaries);
    // 12,000 bytes is 3,000 tokens, re-read by the calls at 3, 4, and 5 seconds.
    expect(top).toMatchObject({ tokens: 3_000, later: 3, rent: 9_000 });
    expect(top!.call.text).toBe("cat src/widgets.ts src/gadgets.ts");
  });
});

describe("cache health", () => {
  const row = (at: number, input: number, cacheWrite: number | null, cacheRead: number): PartRow => ({
    at, input, cacheWrite, cacheRead, output: 100, ttlMs: 300_000, subagent: false,
  });

  it("is one line when the cache held", () => {
    const health = cacheHealth({ providerId: "claude-code", rows: [row(60_000, 50_000, 49_800, 2_000_000)], turns: [turns[0]!], peak: 50_000, session: null });
    expect(health.healthy).toBe(true);
    expect(cacheText(health)).toEqual(["Cache: healthy, 97.6% hit rate, writes 49.8K (1.0× peak context), uncached 200, TTL 5 min"]);
  });

  it("names turns that started after the cache expired, and what they wrote", () => {
    const later = { ...turns[1]!, startedAt: 61_000 + 3_600_000, endedAt: 61_000 + 3_700_000, cacheWrite: 120_000 };
    const health = cacheHealth({
      providerId: "claude-code",
      // The first row predates stored cache writes, so on Claude Code its input counts as writes.
      rows: [row(60_000, 50_000, null, 900_000), row(later.startedAt + 1, 120_000, 120_000, 300_000)],
      turns: [turns[0]!, later],
      peak: 60_000,
      session: null,
    });
    expect(health.parts).toEqual({ input: 0, cacheWrite: 170_000, cacheRead: 1_200_000, output: 200 });
    expect(health.idle).toEqual([{ turn: 2, gapMs: 3_600_000, wrote: 120_000 }]);
    expect(cacheText(health).slice(1)).toEqual([
      "  Under 90% of input came from the cache.",
      "  The context was written 2.8 times over: the cache expired or the prompt's start changed.",
      "  Turn 2 started 1h 0m after the turn before, past the TTL, and wrote 120K.",
    ]);
  });
});

describe("starting prompt", () => {
  it("averages first calls and prices a trim by the window's calls", () => {
    const numbers = startingPrompt("Acme", "/src/widgets", [
      { provider: "claude-code", firstContext: 40_000, calls: 100, contextRead: 10_000_000 },
      { provider: "claude-code", firstContext: 60_000, calls: 300, contextRead: 30_000_000 },
    ]);
    expect(numbers).toMatchObject({ firstContext: 50_000, averageContext: 100_000, calls: 400 });
    const text = startingPromptText([
      { ...numbers, readWeight: 0.1, files: [{ path: "/src/widgets/AGENTS.md", bytes: 8_000 }, { path: "/src/widgets/CLAUDE.md", bytes: 8_000, sameAs: "/src/widgets/AGENTS.md" }] },
    ]);
    expect(text).toContain("Starting prompt: the first call averages 50K tokens, 50% of an average call's 100K.");
    expect(text).toContain("Each 1K tokens trimmed saves 400K cache reads (cost 40K) over these calls.");
    expect(text).toContain("- /src/widgets/AGENTS.md: 8.0KB (~2K tokens)");
    expect(text).toContain("- /src/widgets/CLAUDE.md: the same file as /src/widgets/AGENTS.md");
  });
});

describe("project and repo from a target path", () => {
  const projects = [
    { name: "Acme", paths: ["/src/acme"], gitRemoteUrl: "git@github.com:acme/widgets.git" },
    { name: "Acme Gadgets", paths: ["/src/acme/gadgets"], gitRemoteUrl: "https://github.com/acme/gadgets" },
    { name: "Elsewhere", paths: ["/src/other"], gitRemoteUrl: "git@gitlab.com:acme/other.git" },
  ];

  it("takes the longest matching checkout", () => {
    expect(projectFor("/src/acme/scripts/x.ts", projects)).toEqual({ project: "Acme", repo: "acme/widgets" });
    expect(projectFor("/src/acme/gadgets/AGENTS.md", projects)).toEqual({ project: "Acme Gadgets", repo: "acme/gadgets" });
    expect(projectFor("/src/acme-two/x.ts", projects)).toEqual({ project: "personal", repo: null });
    expect(projectFor("/src/other/x.ts", projects)).toEqual({ project: "Elsewhere", repo: null });
    expect(repoOf("https://github.com/acme/widgets.git")).toBe("acme/widgets");
  });
});

describe("the run's own usage", () => {
  it("adds the running turn, estimated from its context samples, to what was recorded", () => {
    const rows: PartRow[] = [
      { at: 500, input: 1_000, cacheWrite: 1_000, cacheRead: 9_000, output: 100, ttlMs: 3_600_000, subagent: false },
      { at: 2_500, input: 500, cacheWrite: 500, cacheRead: 5_000, output: 50, ttlMs: null, subagent: true },
    ];
    const boundaries = callBoundaries([
      { at: 600, usedTokens: 10_000 },
      { at: 3_000, usedTokens: 12_000 },
      { at: 4_000, usedTokens: 15_000 },
    ]);
    const used = usageSince(rows, boundaries, 0, "claude-code");
    // Recorded: 10,100 + 5,550 tokens. Estimated: reads of 10K and 12K, writes of 2K and 3K.
    expect(used.estimated).toBe(27_000);
    expect(used.tokens).toBe(10_100 + 5_550 + 27_000);
    // 1K×2 + 9K×0.1 + 100×5 = 3,400; 500×1.25 + 5K×0.1 + 50×5 = 1,375; 5K×2 + 22K×0.1 = 12,200.
    expect(used.cost).toBe(3_400 + 1_375 + 12_200);
  });
});

describe("summarize", () => {
  const run: Run = {
    out: "/tmp/run",
    startedAt: 0,
    since: 0,
    windowDays: 7,
    budget: 2_000_000,
    threadIds: ["thr_1"],
    threadCount: 1,
    tokens: 1_600_000,
    cost: 240_000,
    parts: { input: 1_000, cacheWrite: 45_000, cacheRead: 1_500_000, output: 54_000 },
    byProject: [{ name: "Acme", threads: 1, tokens: 1_600_000, cost: 240_000 }],
    byProvider: [{ name: "claude-code", threads: 1, tokens: 1_600_000, cost: 240_000, weighted: true }],
    cache: "Cache: 97% of input read from the cache; every thread healthy.",
  };

  it("caps two findings on the same turn at what the turn cost", () => {
    const findings: Findings = {
      threadCount: 1,
      findings: [
        { ...finding, title: "A", removes: [{ threadId: "thr_1", turn: 1 }] },
        { ...finding, title: "B", removes: [{ threadId: "thr_1", turn: 1, calls: 10, removed: 5 }] },
      ],
    };
    priceAll(findings, thread);
    expect(combinedSavings(findings)).toEqual({ tokens: 1_000_000, cost: 150_000 });
  });

  it("gives what was analyzed, the cache, savings with a weekly rate, and the run against its budget", () => {
    const findings: Findings = { threadCount: 1, findings: [{ ...finding, removes: [{ threadId: "thr_1", turn: 2 }] }], runTokens: { tokens: 3_000_000, cost: 500_000 } };
    priceAll(findings, thread);
    const text = summarize(findings, run);
    expect(text).toContain("**Analyzed:** 1 threads, 240K cost (1.6M tokens).");
    expect(text).toContain("| Cache reads | 1.5M | 94% |");
    expect(text).toContain("| Acme | 1 | 240K | 1.6M | 100% |");
    expect(text).toContain("**Cache:** 97% of input read from the cache; every thread healthy.");
    expect(text).toContain("**If every fix lands:** saves 90K cost (600K tokens), 38% of the analyzed cost. At this run's rate, about 90K cost (600K tokens) a week.");
    expect(text).toMatch(/^\| 1 \| .+ \| 1 \| .+ \| 90K \(600K tokens\) \| .+ \|$/m);
    expect(text).not.toContain("```");
    expect(text).toContain("**This run:** 500K cost (3M tokens) of its 2M budget (25%).");
  });
});
