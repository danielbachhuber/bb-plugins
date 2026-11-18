import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { goalCli, goalView, parseArgs, type GoalDeps } from "./goal-cli.js";
import { createGoalStore } from "./goal-store.js";
import {
  checkStages,
  estimateRecord,
  historyFor,
  originOf,
  parseGoalRange,
  percentileRange,
  remainingLabel,
  stageLabel,
  type HistorySample,
} from "./goals.js";
import { MIGRATIONS } from "./store.js";

describe("parseGoalRange", () => {
  it("reads counts, token suffixes, and single values", () => {
    expect(parseGoalRange("3-8")).toEqual({ low: 3, high: 8 });
    expect(parseGoalRange("5M-15M")).toEqual({ low: 5e6, high: 15e6 });
    expect(parseGoalRange("500k–1.5m")).toEqual({ low: 5e5, high: 1.5e6 });
    expect(parseGoalRange("6")).toEqual({ low: 6, high: 6 });
  });

  it("refuses a reversed or unreadable range", () => {
    expect(parseGoalRange("8-3")).toBeNull();
    expect(parseGoalRange("lots")).toBeNull();
    expect(parseGoalRange(undefined)).toBeNull();
  });
});

describe("checkStages", () => {
  it("allows up to five stages on a task", () => {
    expect(checkStages("task", [" Export built ", "Tests pass", ""])).toEqual({ stages: ["Export built", "Tests pass"] });
    expect("error" in checkStages("task", ["a", "b", "c", "d", "e", "f"])).toBe(true);
  });

  it("wants stages on a task and none on an exploration", () => {
    expect("error" in checkStages("task", [])).toBe(true);
    expect("error" in checkStages("exploration", ["a"])).toBe(true);
    expect(checkStages("exploration", [])).toEqual({ stages: [] });
  });
});

describe("stageLabel", () => {
  const goal = { shape: "task" as const, stages: ["Export built", "Tests pass", "Reloaded in bb"], reached: 1, outcome: null };

  it("names the last stage reached", () => {
    expect(stageLabel(goal)).toBe("1 of 3 · Export built");
    expect(stageLabel({ ...goal, reached: 0 })).toBe("0 of 3");
  });

  it("shows the outcome once closed, and nothing for no goal", () => {
    expect(stageLabel({ ...goal, outcome: "met" })).toBe("Met");
    expect(stageLabel({ ...goal, shape: "none", stages: [] })).toBeNull();
    expect(stageLabel({ ...goal, shape: "exploration", stages: [] })).toBe("Exploring");
  });
});

describe("remainingLabel", () => {
  const goal = { shape: "task" as const, outcome: null, estimate: { turns: { low: 3, high: 8 }, tokens: null, minutes: null } };

  it("counts down the turn range", () => {
    expect(remainingLabel(goal, { turns: 1, tokens: 0, ms: 0 })).toBe("~2–7 turns left");
    expect(remainingLabel(goal, { turns: 9, tokens: 0, ms: 0 })).toBe("past estimate");
  });

  it("says nothing without an estimate or once closed", () => {
    expect(remainingLabel({ ...goal, estimate: { turns: null, tokens: null, minutes: null } }, { turns: 1, tokens: 0, ms: 0 })).toBeNull();
    expect(remainingLabel({ ...goal, outcome: "met" }, { turns: 1, tokens: 0, ms: 0 })).toBeNull();
  });
});

describe("originOf", () => {
  it("tells a plugin's thread, a child, and one you typed apart", () => {
    expect(originOf({ originPluginId: "pr-sweep", parentThreadId: null })).toBe("pr-sweep");
    expect(originOf({ originPluginId: null, parentThreadId: "thr_parent" })).toBe("child");
    expect(originOf({ originPluginId: null, parentThreadId: null })).toBe("typed");
  });
});

describe("historyFor", () => {
  const sample = (turns: number, stages: number | null, origin = "typed"): HistorySample => ({
    origin,
    stages,
    turns,
    tokens: turns * 1e6,
    ms: turns * 60_000,
  });

  it("prefers closed goals with the same start and stage count", () => {
    const goals = [1, 2, 3, 4, 5].map((turns) => sample(turns, 3));
    const history = historyFor("typed", 3, goals, []);
    expect(history?.basis).toContain("with 3 stages");
    expect(history?.turns).toEqual(percentileRange([1, 2, 3, 4, 5]));
  });

  it("falls back to whole archived threads, and to nothing under five", () => {
    const threads = [2, 4, 6, 8, 25].map((turns) => sample(turns, null));
    expect(historyFor("typed", 3, [sample(2, 3)], threads)?.basis).toContain("whole thread");
    expect(historyFor("pr-sweep", 3, [], threads)).toBeNull();
  });
});

describe("estimateRecord", () => {
  it("counts closed goals whose spending landed in each range", () => {
    const estimate = { turns: { low: 2, high: 5 }, tokens: null, minutes: { low: 10, high: 20 } };
    const record = estimateRecord([
      { estimate, outcome: "met", spentAtEnd: { turns: 3, tokens: 1, ms: 15 * 60_000 } },
      { estimate, outcome: "not", spentAtEnd: { turns: 9, tokens: 1, ms: 15 * 60_000 } },
      { estimate, outcome: null, spentAtEnd: null },
    ]);
    expect(record.turns).toEqual({ inside: 1, of: 2 });
    expect(record.tokens).toEqual({ inside: 0, of: 0 });
    expect(record.minutes).toEqual({ inside: 2, of: 2 });
  });
});

describe("parseArgs", () => {
  it("keeps every repeated flag and the quoted goal", () => {
    const { positionals, flags } = parseArgs(["PR merged", "--stage", "Checks pass", "--stage", "Merged", "--turns=3-8"]);
    expect(positionals).toEqual(["PR merged"]);
    expect(flags.get("--stage")).toEqual(["Checks pass", "Merged"]);
    expect(flags.get("--turns")).toEqual(["3-8"]);
  });
});

function setup() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  const goals = createGoalStore(db);
  let now = 10_000;
  const changed: string[] = [];
  const deps: GoalDeps = {
    goals,
    now: () => now,
    historySince: () => 0,
    originOf: async () => "typed",
    changed: (threadId) => changed.push(threadId),
  };
  const turn = (id: string, startedAt: number, completedAt: number | null, tokens: number) => {
    db.prepare(`INSERT INTO turn_times (thread_id, turn_id, started_at, completed_at) VALUES ('thr_a', ?, ?, ?)`).run(id, startedAt, completedAt);
    db.prepare(
      `INSERT INTO usage (event_id, thread_id, created_at, input, cache_read, output, running_total) VALUES (?, 'thr_a', ?, ?, 0, 0, 0)`,
    ).run(`evt_${id}`, startedAt + 1, tokens);
  };
  return { db, goals, deps, changed, turn, advance: (ms: number) => (now += ms) };
}

describe("goal CLI", () => {
  it("records a goal, counts the turn it was set in, and moves through stages to a close", async () => {
    const { deps, changed, turn, advance, goals } = setup();
    turn("t1", 9_000, null, 1_000_000);
    const set = await goalCli(deps, "thr_a", [
      "set",
      "Export the widget list to CSV from the toolbar",
      "--stage",
      "Export built",
      "--stage",
      "Tests pass",
      "--stage",
      "Reloaded in bb",
      "--turns",
      "2-4",
      "--tokens",
      "1M-5M",
    ]);
    expect(set.exitCode).toBe(0);
    expect(set.stdout).toContain("3 stages");
    expect(changed).toEqual(["thr_a"]);

    const goal = goals.current("thr_a")!;
    expect(goal.anchorAt).toBe(9_000);
    expect(goalView(deps, goal).spent).toEqual({ turns: 1, tokens: 1_000_000, ms: 0 });
    expect(goalView(deps, goal).left).toBe("~1–3 turns left");

    expect((await goalCli(deps, "thr_a", ["stage", "next"])).stdout).toBe("Stage: 1 of 3 · Export built.");
    advance(5_000);
    turn("t2", 14_000, 14_500, 2_000_000);
    const closed = await goalCli(deps, "thr_a", ["close", "met", "--note", "Shipped"]);
    expect(closed.stdout).toContain("Closed: Met");
    expect(closed.stdout).toContain("turns inside");
    expect(goalView(deps, goals.current("thr_a")!).label).toBe("Met");
  });

  it("refuses a second goal without a reason, and keeps the first as history when revised", async () => {
    const { deps, goals, advance } = setup();
    await goalCli(deps, "thr_a", ["set", "Webhook sync ADR merged", "--stage", "Merged"]);
    const refused = await goalCli(deps, "thr_a", ["set", "Sync decision recorded", "--stage", "Merged"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("/tokenomics-set-goal");

    advance(1_000);
    const revised = await goalCli(deps, "thr_a", [
      "set",
      "Sync decision recorded, comparing three options",
      "--stage",
      "Compared",
      "--stage",
      "Merged",
      "--reason",
      "Widened from one option to three",
    ]);
    expect(revised.stdout).toContain("replacing the earlier goal");
    const history = goals.history("thr_a");
    expect(history).toHaveLength(2);
    expect(history[0]!.replacedAt).toBe(11_000);
    expect(goals.current("thr_a")!.reason).toBe("Widened from one option to three");
    expect((await goalCli(deps, "thr_a", ["show"])).stdout).toContain("Earlier goals:");
  });

  it("refuses a sixth stage and records an explicit no-goal", async () => {
    const { deps, goals } = setup();
    const six = ["a", "b", "c", "d", "e", "f"].flatMap((stage) => ["--stage", stage]);
    expect((await goalCli(deps, "thr_a", ["set", "Too much", ...six])).exitCode).toBe(1);
    expect((await goalCli(deps, "thr_a", ["set", "--none"])).stdout).toContain("no goal");
    expect(stageLabel(goals.current("thr_a")!)).toBeNull();
  });

  it("deletes a thread's goals with the thread", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "Question answered", "--shape", "exploration"]);
    goals.deleteThread("thr_a");
    expect(goals.current("thr_a")).toBeNull();
  });
});
