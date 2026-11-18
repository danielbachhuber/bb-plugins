// Thread goals in the plugin's database. The tables are created by MIGRATIONS
// in store.ts; this module reads and writes them.
import type { Database } from "better-sqlite3";

import { finishedCount, GOAL_DETAILS, legacyEntries, MAX_ENTRIES, parseEntries, type GoalDetail, type GoalEntry } from "./goals.js";
import type { Goal, GoalEstimate, GoalSetBy, GoalShape, HistorySample, Outcome, Range, Spent } from "./goals.js";

interface GoalRow {
  id: number;
  thread_id: string;
  set_at: number;
  anchor_at: number;
  shape: string;
  goal: string;
  stages: string;
  reached: number;
  items: string | null;
  entries: string | null;
  detail: string | null;
  pr: string | null;
  set_by: string;
  reason: string | null;
  origin: string | null;
  turns_low: number | null;
  turns_high: number | null;
  tokens_low: number | null;
  tokens_high: number | null;
  minutes_low: number | null;
  minutes_high: number | null;
  replaced_at: number | null;
  outcome: string | null;
  outcome_note: string | null;
  closed_at: number | null;
  spent_turns: number | null;
  spent_tokens: number | null;
  spent_ms: number | null;
}

function rangeOf(low: number | null, high: number | null): Range | null {
  return low === null || high === null ? null : { low, high };
}

/** The row's "Done is" list, or, for a goal from before it, its items and stages as one. */
function entriesOf(row: GoalRow): GoalEntry[] {
  const entries = parseEntries(row.entries);
  if (entries !== null) return entries;
  let stages: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.stages);
    if (Array.isArray(parsed)) stages = parsed.filter((stage): stage is string => typeof stage === "string");
  } catch {
    // A row written by hand; show it without stages.
  }
  const legacy = legacyEntries(stages, row.reached, parseEntries(row.items) ?? []);
  // Stages were done in order, so an open goal was working on the next one.
  const next = legacy.findIndex((entry, index) => index >= legacy.length - stages.length && entry.state === "todo");
  if (row.outcome === null && next >= 0) legacy[next] = { ...legacy[next]!, state: "current" };
  return legacy;
}

function goalOf(row: GoalRow): Goal {
  const entries = entriesOf(row);
  const detail: GoalDetail = GOAL_DETAILS.includes(row.detail as GoalDetail)
    ? (row.detail as GoalDetail)
    : entries.length > MAX_ENTRIES.low
      ? "high"
      : "low";
  return {
    id: row.id,
    threadId: row.thread_id,
    setAt: row.set_at,
    anchorAt: row.anchor_at,
    shape: row.shape as GoalShape,
    text: row.goal,
    entries,
    detail,
    pr: row.pr,
    setBy: row.set_by as GoalSetBy,
    reason: row.reason,
    origin: row.origin,
    estimate: {
      turns: rangeOf(row.turns_low, row.turns_high),
      tokens: rangeOf(row.tokens_low, row.tokens_high),
      minutes: rangeOf(row.minutes_low, row.minutes_high),
    },
    replacedAt: row.replaced_at,
    outcome: row.outcome as Outcome | null,
    outcomeNote: row.outcome_note,
    closedAt: row.closed_at,
    spentAtEnd:
      row.spent_turns === null ? null : { turns: row.spent_turns, tokens: row.spent_tokens ?? 0, ms: row.spent_ms ?? 0 },
  };
}

export interface NewGoal {
  threadId: string;
  setAt: number;
  anchorAt: number;
  shape: GoalShape;
  text: string;
  entries: GoalEntry[];
  detail: GoalDetail;
  pr: string | null;
  setBy: GoalSetBy;
  reason: string | null;
  origin: string | null;
  estimate: GoalEstimate;
}

export function createGoalStore(db: Database) {
  const selectCurrent = db.prepare(
    `SELECT * FROM goals WHERE thread_id = ? AND replaced_at IS NULL ORDER BY set_at DESC, id DESC LIMIT 1`,
  );
  const selectHistory = db.prepare(`SELECT * FROM goals WHERE thread_id = ? ORDER BY set_at, id`);
  const insertGoal = db.prepare(
    `INSERT INTO goals (thread_id, set_at, anchor_at, shape, goal, stages, reached, entries, detail, pr, set_by, reason, origin,
       turns_low, turns_high, tokens_low, tokens_high, minutes_low, minutes_high)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const markReplaced = db.prepare(
    `UPDATE goals SET replaced_at = ?, spent_turns = coalesce(spent_turns, ?), spent_tokens = coalesce(spent_tokens, ?),
       spent_ms = coalesce(spent_ms, ?) WHERE id = ?`,
  );
  // stages and reached stay filled, as the labels and the finished count, for history's entry counts.
  const updateEntries = db.prepare(`UPDATE goals SET entries = ?, stages = ?, reached = ? WHERE id = ?`);
  const updateEstimate = db.prepare(
    `UPDATE goals SET turns_low = ?, turns_high = ?, tokens_low = ?, tokens_high = ?, minutes_low = ?, minutes_high = ? WHERE id = ?`,
  );
  const updateOutcome = db.prepare(
    `UPDATE goals SET outcome = ?, outcome_note = ?, closed_at = ?, spent_turns = ?, spent_tokens = ?, spent_ms = ? WHERE id = ?`,
  );
  const updateReopen = db.prepare(
    `UPDATE goals SET outcome = NULL, outcome_note = NULL, closed_at = NULL, spent_turns = NULL, spent_tokens = NULL,
       spent_ms = NULL WHERE id = ?`,
  );
  const deleteThreadGoals = db.prepare(`DELETE FROM goals WHERE thread_id = ?`);
  const selectTurnStart = db.prepare(
    `SELECT max(started_at) AS at FROM turn_times WHERE thread_id = ? AND started_at <= ?`,
  );
  const selectOrigin = db.prepare(`SELECT origin FROM threads WHERE thread_id = ?`);
  const updateSpent = db.prepare(`UPDATE goals SET spent_turns = ?, spent_tokens = ?, spent_ms = ? WHERE id = ?`);
  const selectSpentTokens = db.prepare(
    `SELECT coalesce(sum(input + cache_read + output), 0) AS total FROM (
       SELECT input, cache_read, output FROM usage WHERE thread_id = ? AND created_at >= ? AND created_at < ?
       UNION ALL
       SELECT input, cache_read, output FROM subagent_calls WHERE thread_id = ? AND created_at >= ? AND created_at < ?)`,
  );
  const selectSpentTurns = db.prepare(
    `SELECT count(*) AS turns,
            coalesce(sum(CASE WHEN completed_at IS NOT NULL AND completed_at >= started_at
                              THEN min(completed_at, ?) - started_at ELSE 0 END), 0) AS ms
     FROM turn_times WHERE thread_id = ? AND started_at >= ? AND started_at < ?`,
  );
  const selectClosedGoals = db.prepare(
    `SELECT origin, stages, spent_turns AS turns, spent_tokens AS tokens, spent_ms AS ms FROM goals
     WHERE outcome IS NOT NULL AND spent_turns IS NOT NULL AND closed_at >= ?`,
  );
  // Archived threads from the past window, whole: their turns, tokens, and time.
  const selectArchivedThreads = db.prepare(
    `SELECT t.thread_id AS threadId, t.origin AS origin,
       (SELECT count(*) FROM turn_times tt WHERE tt.thread_id = t.thread_id) AS turns,
       (SELECT coalesce(sum(CASE WHEN completed_at >= started_at THEN completed_at - started_at ELSE 0 END), 0)
          FROM turn_times tt WHERE tt.thread_id = t.thread_id) AS ms,
       (SELECT coalesce(sum(input + cache_read + output), 0) FROM usage u WHERE u.thread_id = t.thread_id)
         + (SELECT coalesce(sum(input + cache_read + output), 0) FROM subagent_calls s WHERE s.thread_id = t.thread_id) AS tokens
     FROM threads t
     WHERE t.archived_at IS NOT NULL AND t.archived_at >= ? AND t.origin IS NOT NULL`,
  );
  const selectAllGoals = db.prepare(`SELECT * FROM goals WHERE set_at >= ? ORDER BY set_at`);
  const selectActiveCurrent = db.prepare(
    `SELECT g.* FROM goals g JOIN threads t ON t.thread_id = g.thread_id
     WHERE g.replaced_at IS NULL AND t.archived_at IS NULL
       AND g.id = (SELECT id FROM goals g2 WHERE g2.thread_id = g.thread_id AND g2.replaced_at IS NULL
                   ORDER BY set_at DESC, id DESC LIMIT 1)`,
  );

  return {
    current(threadId: string): Goal | null {
      const row = selectCurrent.get(threadId) as GoalRow | undefined;
      return row === undefined ? null : goalOf(row);
    },

    /** Every goal the thread recorded, oldest first, revisions included. */
    history(threadId: string): Goal[] {
      return (selectHistory.all(threadId) as GoalRow[]).map(goalOf);
    },

    /** The current goal of every active thread that has one. */
    activeCurrent(): Goal[] {
      return (selectActiveCurrent.all() as GoalRow[]).map(goalOf);
    },

    /** Every goal set since `since`, oldest first. */
    since(since: number): Goal[] {
      return (selectAllGoals.all(since) as GoalRow[]).map(goalOf);
    },

    /** When the turn running at `at` started, so a goal set mid-turn counts the whole turn. */
    turnStartAt(threadId: string, at: number): number | null {
      return (selectTurnStart.get(threadId, at) as { at: number | null }).at;
    },

    origin(threadId: string): string | null {
      return (selectOrigin.get(threadId) as { origin: string | null } | undefined)?.origin ?? null;
    },

    /** What the thread used from `from` up to `to`. */
    spent(threadId: string, from: number, to: number): Spent {
      const tokens = (selectSpentTokens.get(threadId, from, to, threadId, from, to) as { total: number }).total;
      const turns = selectSpentTurns.get(to, threadId, from, to) as { turns: number; ms: number };
      return { turns: turns.turns, tokens, ms: turns.ms };
    },

    /**
     * What a goal has used: up to when a later goal replaced it, or up to now.
     * A closed goal keeps counting, because work after the close, such as
     * acting on feedback, is still about it until another goal is set.
     */
    spentOn(goal: Goal, now: number): Spent {
      if (goal.replacedAt !== null && goal.spentAtEnd !== null) return goal.spentAtEnd;
      return this.spent(goal.threadId, goal.anchorAt, now + 1);
    },

    /**
     * Saves again what the thread's closed, current goal has used, so history
     * and the outcomes view count the turns since it closed. Returns how many
     * changed.
     */
    refreshClosed(threadId: string, now: number): number {
      const goal = this.current(threadId);
      if (goal === null || goal.closedAt === null) return 0;
      const spent = this.spent(threadId, goal.anchorAt, now + 1);
      const saved = goal.spentAtEnd;
      if (saved !== null && saved.turns === spent.turns && saved.tokens === spent.tokens && saved.ms === spent.ms) return 0;
      updateSpent.run(spent.turns, spent.tokens, spent.ms, goal.id);
      return 1;
    },

    /** Adds a goal. A current goal, closed or not, becomes an earlier one. */
    set(goal: NewGoal, previous: { id: number; spent: Spent } | null): Goal {
      const run = db.transaction(() => {
        if (previous !== null) {
          markReplaced.run(goal.setAt, previous.spent.turns, previous.spent.tokens, previous.spent.ms, previous.id);
        }
        const { turns, tokens, minutes } = goal.estimate;
        insertGoal.run(
          goal.threadId,
          goal.setAt,
          goal.anchorAt,
          goal.shape,
          goal.text,
          JSON.stringify(goal.entries.map((entry) => entry.label)),
          finishedCount(goal.entries),
          JSON.stringify(goal.entries),
          goal.detail,
          goal.pr,
          goal.setBy,
          goal.reason,
          goal.origin,
          turns?.low ?? null,
          turns?.high ?? null,
          tokens?.low ?? null,
          tokens?.high ?? null,
          minutes?.low ?? null,
          minutes?.high ?? null,
        );
      });
      run();
      return this.current(goal.threadId)!;
    },

    /** Replaces the goal's "Done is" list. */
    setEntries(goalId: number, entries: readonly GoalEntry[]): void {
      updateEntries.run(JSON.stringify(entries), JSON.stringify(entries.map((entry) => entry.label)), finishedCount(entries), goalId);
    },

    setEstimate(goalId: number, estimate: GoalEstimate): void {
      const { turns, tokens, minutes } = estimate;
      updateEstimate.run(turns?.low ?? null, turns?.high ?? null, tokens?.low ?? null, tokens?.high ?? null, minutes?.low ?? null, minutes?.high ?? null, goalId);
    },

    /** Records how the goal ended. A met goal has every entry done, apart from those dropped. */
    close(goalId: number, outcome: Outcome, note: string | null, at: number, spent: Spent, entries: readonly GoalEntry[]): void {
      db.transaction(() => {
        updateOutcome.run(outcome, note, at, spent.turns, spent.tokens, spent.ms, goalId);
        if (outcome === "met") {
          this.setEntries(goalId, entries.map((entry) => (entry.state === "dropped" ? entry : { ...entry, state: "done" as const })));
        }
      })();
    },

    /** Opens a closed goal again, with `entries` as its list from now on. */
    reopen(goalId: number, entries: readonly GoalEntry[]): void {
      db.transaction(() => {
        updateReopen.run(goalId);
        this.setEntries(goalId, entries);
      })();
    },

    /** Removes the thread's goals, once bb deletes the thread. */
    deleteThread(threadId: string): void {
      deleteThreadGoals.run(threadId);
    },

    /** Closed goals and archived whole threads since `since`, for estimates. */
    historySamples(since: number): { goals: HistorySample[]; threads: HistorySample[] } {
      const goals = (selectClosedGoals.all(since) as Array<{ origin: string | null; stages: string; turns: number; tokens: number; ms: number }>).map(
        (row) => {
          let stages: number | null = null;
          try {
            const parsed: unknown = JSON.parse(row.stages);
            stages = Array.isArray(parsed) ? parsed.length : null;
          } catch {
            stages = null;
          }
          return { origin: row.origin, stages, turns: row.turns, tokens: row.tokens, ms: row.ms };
        },
      );
      const threads = (selectArchivedThreads.all(since) as Array<{ origin: string | null; turns: number; tokens: number; ms: number }>)
        .filter((row) => row.turns > 0)
        .map((row) => ({ origin: row.origin, stages: null, turns: row.turns, tokens: row.tokens, ms: row.ms }));
      return { goals, threads };
    },

    /** Archived whole threads since `since`, with whether each recorded a goal, for the outcomes view. */
    archivedThreads(since: number): Array<{ threadId: string; origin: string | null; turns: number; tokens: number; ms: number }> {
      return (selectArchivedThreads.all(since) as Array<{ threadId: string; origin: string | null; turns: number; tokens: number; ms: number }>).filter(
        (row) => row.turns > 0,
      );
    },
  };
}

export type GoalStore = ReturnType<typeof createGoalStore>;
