import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { splitBreakdown } from "./breakdown.js";
import { createStore, MIGRATIONS } from "./store.js";
import { createSync, TOKEN_USAGE_EVENT, type EventSource, type ThreadLike, type UsageEventLike } from "./sync.js";

function openStore() {
  const db = new Database(":memory:");
  for (const statement of MIGRATIONS) db.exec(statement);
  return createStore(db);
}

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 8, 24, 10);

const thread: ThreadLike = {
  id: "thr_widgets",
  title: "Add a CSV export",
  titleFallback: null,
  projectId: "prj_acme",
  providerId: "claude-code",
};

function usageEvent(seq: number, createdAt: number, last: number, total: number): UsageEventLike {
  return {
    id: `evt_${seq}`,
    seq,
    createdAt,
    type: TOKEN_USAGE_EVENT,
    data: {
      tokenUsage: {
        total: { totalTokens: total, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 },
        last: {
          totalTokens: last,
          inputTokens: 10,
          cachedInputTokens: last - 110,
          cacheReadInputTokens: last - 200,
          cacheWriteInputTokens: 90,
          outputTokens: 100,
          reasoningOutputTokens: 0,
        },
      },
    },
  };
}

function fakeSource(events: UsageEventLike[], threads: ThreadLike[] = [thread]) {
  const calls: Array<number | null> = [];
  const source: EventSource = {
    async listUsage({ threadId, afterSeq, limit }) {
      calls.push(afterSeq);
      // bb's event ids are unique across threads.
      return events
        .filter((event) => event.seq > (afterSeq ?? 0))
        .slice(0, limit)
        .map((event) => ({ ...event, id: `${threadId}_${event.id}` }));
    },
    async listThreads({ archived, offset, limit }) {
      return archived ? [] : threads.slice(offset, offset + limit);
    },
  };
  return { source, calls };
}

describe("splitBreakdown", () => {
  it("separates Claude Code's cache reads from its cache writes", () => {
    // Claude Code: inputTokens excludes cached input.
    expect(
      splitBreakdown({
        totalTokens: 41_659_242,
        inputTokens: 312,
        cachedInputTokens: 41_537_400,
        cacheReadInputTokens: 41_250_000,
        cacheWriteInputTokens: 287_400,
        outputTokens: 121_530,
        reasoningOutputTokens: 0,
      }),
    ).toEqual({ input: 287_712, cacheRead: 41_250_000, output: 121_530 });
  });

  it("takes the cached part out of Codex's input", () => {
    // Codex: inputTokens includes cachedInputTokens.
    expect(
      splitBreakdown({
        totalTokens: 38_822,
        inputTokens: 38_420,
        cachedInputTokens: 35_840,
        outputTokens: 402,
        reasoningOutputTokens: 96,
      }),
    ).toEqual({ input: 2_580, cacheRead: 35_840, output: 402 });
  });

  it("never reports a negative part", () => {
    expect(
      splitBreakdown({ totalTokens: 10, inputTokens: 0, cachedInputTokens: 50, outputTokens: 20, reasoningOutputTokens: 0 }),
    ).toEqual({ input: 0, cacheRead: 0, output: 10 });
  });
});

describe("sync and store", () => {
  it("records each turn once and resumes after the last event read", async () => {
    const store = openStore();
    const events = [usageEvent(5, T0, 1_000, 1_000), usageEvent(9, T0 + 60_000, 2_000, 3_000)];
    const { source, calls } = fakeSource(events);
    const sync = createSync(store, source);

    expect(await sync.syncThread(thread)).toBe(2);
    events.push(usageEvent(12, T0 + HOUR, 500, 3_500));
    expect(await sync.syncThread(thread)).toBe(1);

    expect(calls).toEqual([null, 9]);
    expect(store.threadTotal(thread.id)).toEqual({
      tokens: { input: 300, cacheRead: 2_900, output: 300 },
      total: 3_500,
      turns: 3,
    });
    expect(store.threadTurns(thread.id, 2).map((turn) => turn.at)).toEqual([T0 + 60_000, T0 + HOUR]);
  });

  it("buckets usage by hour and ranks threads by what they used in the window", async () => {
    const store = openStore();
    const other: ThreadLike = { ...thread, id: "thr_gadgets", title: null, titleFallback: "Fix the flaky test" };
    await createSync(store, fakeSource([usageEvent(1, T0 + 5 * 60_000, 1_000, 1_000)]).source).syncThread(thread);
    await createSync(
      store,
      fakeSource([usageEvent(1, T0 + 10 * 60_000, 4_000, 4_000), usageEvent(2, T0 + HOUR + 1, 2_000, 6_000)]).source,
    ).syncThread(other);

    expect(store.hoursSince(T0).map(({ hour, input, cacheRead, output }) => [hour, input + cacheRead + output])).toEqual([
      [T0, 5_000],
      [T0 + HOUR, 2_000],
    ]);
    expect(store.threadsSince(T0 + HOUR).map((row) => [row.threadId, row.turns])).toEqual([["thr_gadgets", 1]]);
    expect(store.threadsSince(T0).map((row) => [row.threadId, row.title])).toEqual([
      ["thr_gadgets", "Fix the flaky test"],
      ["thr_widgets", "Add a CSV export"],
    ]);
  });

  it("counts a thread's running total when bb pruned its earlier turns", async () => {
    const store = openStore();
    // Only the latest event survived; the provider's running total is higher.
    await createSync(store, fakeSource([usageEvent(300, T0, 2_000, 90_000)]).source).syncThread(thread);
    expect(store.threadTotal(thread.id).total).toBe(90_000);
  });

  it("runs one read per thread at a time and reads again for a request made during it", async () => {
    const store = openStore();
    const events = [usageEvent(1, T0, 1_000, 1_000)];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { source, calls } = fakeSource(events);
    const slow: EventSource = {
      ...source,
      async listUsage(args) {
        await gate;
        return source.listUsage(args);
      },
    };
    const added: string[] = [];
    const sync = createSync(store, slow, { onAdded: (threadId) => added.push(threadId) });

    const first = sync.syncThread(thread);
    const second = sync.syncThread(thread);
    events.push(usageEvent(2, T0 + 1, 1_000, 2_000));
    release();
    expect(await first).toBe(2);
    expect(await second).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual([null, 2]);
    // The second read found nothing new, so only the first announced.
    expect(added).toEqual(["thr_widgets"]);
  });

  it("reads every thread on a full sync", async () => {
    const store = openStore();
    const { source } = fakeSource([usageEvent(1, T0, 1_000, 1_000)], [thread, { ...thread, id: "thr_gadgets" }]);
    const changed = await createSync(store, source).syncAll(new AbortController().signal);
    expect(changed).toEqual(["thr_widgets", "thr_gadgets"]);
  });

  it("keeps the first recording time across loads", () => {
    const store = openStore();
    expect(store.startedAt(T0)).toBe(T0);
    expect(store.startedAt(T0 + HOUR)).toBe(T0);
  });
});
