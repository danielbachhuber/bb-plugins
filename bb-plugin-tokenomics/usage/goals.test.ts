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
    expect(checkStages("exploration", [])).toEqual({ stages: ["Answer recommended", "You decided"] });
  });
});

describe("stageLabel", () => {
  const entries = (states: string[], labels = ["Export built", "Tests pass", "Reloaded in bb"]) =>
    labels.map((label, index) => ({ label, state: states[index] as "todo" | "current" | "done" | "dropped" }));
  const goal = { shape: "task" as const, entries: entries(["done", "current", "todo"]), outcome: null };

  it("counts the finished entries and names the one in progress", () => {
    expect(stageLabel(goal)).toBe("1 of 3 · Tests pass");
    expect(stageLabel({ ...goal, entries: entries(["todo", "todo", "todo"]) })).toBe("0 of 3");
    expect(stageLabel({ ...goal, entries: entries(["done", "dropped", "todo"]) })).toBe("2 of 3");
  });

  it("shows the outcome once closed, and nothing for no goal", () => {
    expect(stageLabel({ ...goal, outcome: "met" })).toBe("Met");
    expect(stageLabel({ ...goal, shape: "none", entries: [] })).toBeNull();
    expect(stageLabel({ ...goal, shape: "exploration", entries: [] })).toBe("Exploring");
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
    expect(history?.basis).toContain("with 3 entries");
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
    expect(set.stdout).toContain("3 entries, low detail");
    expect(changed).toEqual(["thr_a"]);

    const goal = goals.current("thr_a")!;
    expect(goal.anchorAt).toBe(9_000);
    expect(goalView(deps, goal).spent).toEqual({ turns: 1, tokens: 1_000_000, ms: 0 });
    expect(goalView(deps, goal).left).toBe("~1–3 turns left");

    expect((await goalCli(deps, "thr_a", ["stage", "next"])).stdout).toBe("Done is: 1 of 3.");
    advance(5_000);
    turn("t2", 14_000, 14_500, 2_000_000);
    const closed = await goalCli(deps, "thr_a", ["close", "met", "--note", "Shipped"]);
    expect(closed.stdout).toContain("Closed: Met");
    expect(closed.stdout).toContain("turns inside");
    expect(goalView(deps, goals.current("thr_a")!).label).toBe("Met");
  });

  it("clears the goal, keeping it in the history", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "Webhook sync ADR merged", "--stage", "Merged"]);
    const cleared = await goalCli(deps, "thr_a", ["clear"]);
    expect(cleared.stdout).toContain('Cleared the goal "Webhook sync ADR merged"');
    expect(goals.current("thr_a")!.shape).toBe("none");
    expect(goals.history("thr_a")).toHaveLength(2);
    expect((await goalCli(deps, "thr_a", ["clear"])).stdout).toBe("This thread has no goal.");
  });

  it("refuses a second goal without a reason, and keeps the first as history when revised", async () => {
    const { deps, goals, advance } = setup();
    await goalCli(deps, "thr_a", ["set", "Webhook sync ADR merged", "--stage", "Merged"]);
    const refused = await goalCli(deps, "thr_a", ["set", "Sync decision recorded", "--stage", "Merged"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain("/tokenomics-update-goal");

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

describe("a closed goal", () => {
  it("keeps counting the thread's turns after it closed", async () => {
    const { db, deps, goals, advance } = setup();
    db.prepare(`INSERT INTO turn_times (thread_id, turn_id, started_at, completed_at) VALUES ('thr_a', 't1', 9000, NULL)`).run();
    await goalCli(deps, "thr_a", ["set", "Export built", "--stage", "Built", "--turns", "1-2"]);
    advance(1_000);
    await goalCli(deps, "thr_a", ["close", "met"]);
    expect(goals.current("thr_a")!.spentAtEnd!.tokens).toBe(0);

    // The turn ends, and bb records its usage.
    db.prepare(`UPDATE turn_times SET completed_at = 12000 WHERE turn_id = 't1'`).run();
    db.prepare(`INSERT INTO usage (event_id, thread_id, created_at, input, cache_read, output, running_total) VALUES ('e1', 'thr_a', 11900, 3000000, 0, 0, 0)`).run();
    expect(goals.refreshClosed("thr_a", 12_000)).toBe(1);
    expect(goals.current("thr_a")!.spentAtEnd).toEqual({ turns: 1, tokens: 3_000_000, ms: 3_000 });
    expect(goals.refreshClosed("thr_a", 12_000)).toBe(0);
  });
});

describe("goal reopen", () => {
  it("opens a closed goal again with an entry for the feedback", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "Export built", "--stage", "Built", "--stage", "Verified"]);
    await goalCli(deps, "thr_a", ["stage", "2"]);
    await goalCli(deps, "thr_a", ["close", "met"]);
    expect((await goalCli(deps, "thr_a", ["reopen", "--stage", "Refined on your feedback"])).stdout).toBe("Reopened: Export built (2 of 3).");
    const goal = goals.current("thr_a")!;
    expect(goal.outcome).toBeNull();
    expect(goal.entries.map((entry) => entry.label)).toEqual(["Built", "Verified", "Refined on your feedback"]);
    expect((await goalCli(deps, "thr_a", ["reopen"])).exitCode).toBe(1);
  });
});

describe("closing a goal as met", () => {
  it("marks every entry done but the dropped ones", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "Bullet added", "--stage", "Change approved", "--stage", "Docs updated", "--stage", "Committed and pushed"]);
    await goalCli(deps, "thr_a", ["entry", "drop", "2"]);
    await goalCli(deps, "thr_a", ["close", "met"]);
    expect(goals.current("thr_a")!.entries.map((entry) => entry.state)).toEqual(["done", "dropped", "done"]);
  });

  it("leaves the entries as they were when partly met", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "Bullet added", "--stage", "Change approved", "--stage", "Committed and pushed"]);
    await goalCli(deps, "thr_a", ["stage", "next"]);
    await goalCli(deps, "thr_a", ["close", "partly"]);
    expect(goals.current("thr_a")!.entries.map((entry) => entry.state)).toEqual(["done", "todo"]);
  });
});

describe("goal entry", () => {
  it("adds the entry that ends the thread, marks entries by number, and keeps counts on grouped ones", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "The widget security issues are resolved", "--stage", "Critical and high findings addressed", "--stage", "Medium findings addressed"]);
    expect((await goalCli(deps, "thr_a", ["add-stage", "You approved each action"])).stdout).toBe(
      "Done is: 0 of 3 finished, 3 open (low detail, 5 at most).",
    );
    await goalCli(deps, "thr_a", ["entry", "count", "1", "4/6"]);
    await goalCli(deps, "thr_a", ["entry", "count", "2", "9/9"]);
    const goal = goals.current("thr_a")!;
    expect(goal.entries.map((entry) => entry.state)).toEqual(["current", "done", "todo"]);
    expect(goal.entries[0]!.count).toEqual({ done: 4, total: 6 });
    const shown = (await goalCli(deps, "thr_a", ["show"])).stdout!;
    expect(shown).toContain("Done is (1 of 3, low detail, 5 at most):");
    expect(shown).toContain("  1. [>] Critical and high findings addressed (4 of 6)");
    const json = JSON.parse((await goalCli(deps, "thr_a", ["show", "--json"])).stdout!);
    expect(json.entries).toHaveLength(3);
    expect(json.detail).toBe("low");
    expect((await goalCli(deps, "thr_a", ["entry", "count", "1", "7/6"])).exitCode).toBe(1);
  });

  it("caps the list at the detail level", async () => {
    const { deps } = setup();
    const six = ["a", "b", "c", "d", "e", "f"].flatMap((label) => ["--stage", label]);
    expect((await goalCli(deps, "thr_a", ["set", "Findings handled", ...six])).stderr).toContain("too many at low detail");
    expect((await goalCli(deps, "thr_a", ["set", "Findings handled", ...six, "--detail", "high"])).exitCode).toBe(0);
    const twenty = Array.from({ length: 20 }, (_, index) => `Finding ${index + 1}`);
    expect((await goalCli(deps, "thr_a", ["entry", "add", ...twenty])).exitCode).toBe(1);
    expect((await goalCli(deps, "thr_a", ["entry", "add", ...twenty.slice(0, 19)])).exitCode).toBe(0);
  });

  it("refuses numbers outside the list and unknown verbs", async () => {
    const { deps } = setup();
    await goalCli(deps, "thr_a", ["set", "Findings handled", "--stage", "Done"]);
    expect((await goalCli(deps, "thr_a", ["entry", "done", "2"])).exitCode).toBe(1);
    expect((await goalCli(deps, "thr_a", ["entry", "finish", "1"])).exitCode).toBe(1);
    // The name from before the "Done is" list still works.
    expect((await goalCli(deps, "thr_a", ["item", "done", "1"])).exitCode).toBe(0);
  });
});

describe("goal refine", () => {
  it("rewrites the open goal, keeps the state of entries kept word for word, and records why", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "Goal band built", "--stage", "Designs picked", "--stage", "Band built", "--stage", "Refined on your feedback"]);
    await goalCli(deps, "thr_a", ["stage", "2"]);
    const result = await goalCli(deps, "thr_a", [
      "refine", "Goal shown in the token button", "--stage", "Designs picked", "--stage", "Button built", "--stage", "Refined on your feedback",
      "--detail", "high", "--reason", "Moved from the band to the token button",
    ]);
    expect(result.stdout).toContain("Refined: Goal shown in the token button (1 of 3)");
    const current = goals.current("thr_a")!;
    expect(current.entries.map((entry) => entry.state)).toEqual(["done", "todo", "todo"]);
    expect(current.detail).toBe("high");
    expect(current.reason).toBe("Moved from the band to the token button");
    expect(goals.history("thr_a")).toHaveLength(2);
  });

  it("needs a reason, takes --reached, and keeps the level", async () => {
    const { deps, goals } = setup();
    await goalCli(deps, "thr_a", ["set", "Export built", "--stage", "Built", "--stage", "Tested", "--detail", "high"]);
    expect((await goalCli(deps, "thr_a", ["refine", "--stage", "Built", "--stage", "Tested", "--stage", "Merged"])).exitCode).toBe(1);
    await goalCli(deps, "thr_a", ["refine", "--stage", "Built", "--stage", "Tested", "--stage", "Merged", "--reached", "2", "--reason", "Merging is part of it"]);
    const goal = goals.current("thr_a")!;
    expect(goal.entries.map((entry) => entry.state)).toEqual(["done", "done", "todo"]);
    expect(goal.text).toBe("Export built");
    expect(goal.detail).toBe("high");
  });
});

describe("goals from before the Done is list", () => {
  it("read their items, then their stages, as entries, with the next stage in progress", () => {
    const { db, goals } = setup();
    db.prepare(
      `INSERT INTO goals (thread_id, set_at, anchor_at, shape, goal, stages, reached, items, set_by) VALUES ('thr_a', 1, 1, 'task', 'Findings filed', ?, 1, ?, 'agent')`,
    ).run(JSON.stringify(["Triaged", "Filed", "Approved"]), JSON.stringify([{ label: "H1", state: "done" }]));
    const goal = goals.current("thr_a")!;
    expect(goal.entries.map((entry) => `${entry.label}:${entry.state}`)).toEqual(["H1:done", "Triaged:done", "Filed:current", "Approved:todo"]);
    expect(goal.detail).toBe("low");
  });
});
