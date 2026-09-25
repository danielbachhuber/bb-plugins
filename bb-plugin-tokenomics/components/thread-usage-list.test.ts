import { describe, expect, it } from "vitest";

import type { ThreadUsage } from "@/usage/contract";

import { threadBars, threadsIn } from "./thread-usage-list";

const HOUR = 3_600_000;

function thread(threadId: string, archivedAt: number | null, hours: ThreadUsage["hours"] = []): ThreadUsage {
  return { threadId, title: null, projectId: "prj_acme", projectName: "widgets", providerId: "claude-code", archivedAt, turns: 1, hours, input: 0, cacheRead: 0, output: 0 };
}

describe("threadsIn", () => {
  const now = 10 * 24 * HOUR;
  const threads = [
    thread("thr_active", null),
    thread("thr_recent", now - 2 * HOUR),
    thread("thr_edge", now - 72 * HOUR),
    thread("thr_older", now - 73 * HOUR),
  ];

  it("splits active threads from those archived in the past three days and before", () => {
    expect(threadsIn(threads, "active", now).map((t) => t.threadId)).toEqual(["thr_active"]);
    expect(threadsIn(threads, "recent", now).map((t) => t.threadId)).toEqual(["thr_recent", "thr_edge"]);
    expect(threadsIn(threads, "older", now).map((t) => t.threadId)).toEqual(["thr_older"]);
  });
});

describe("threadBars", () => {
  it("adds each hour to the page bar it falls in", () => {
    const bars = [0, 1, 2].map((index) => ({ start: index * 2 * HOUR, end: (index + 1) * 2 * HOUR, input: 0, cacheRead: 0, output: 0 }));
    const totals = threadBars(
      thread("thr_active", null, [
        { hour: 0, total: 5 },
        { hour: HOUR, total: 3 },
        { hour: 4 * HOUR, total: 7 },
        { hour: 9 * HOUR, total: 100 },
      ]),
      bars,
    );
    expect(totals).toEqual([8, 0, 7]);
  });
});
