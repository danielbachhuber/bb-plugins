import { describe, expect, it } from "vitest";

import type { TimingRows } from "./timing.js";
import { lastRowByTurn, turnIdOfRow, turnSummaries, turnWork } from "./turn-summary.js";

const SEC = 1_000;
const T0 = Date.UTC(2026, 8, 24, 9);

const timings: TimingRows = {
  turns: [
    { turnId: "t1", startedAt: T0, completedAt: T0 + 90 * SEC },
    { turnId: "t2", startedAt: T0 + 120 * SEC, completedAt: null },
  ],
  items: [
    { itemId: "i1", turnId: "t1", kind: "commandExecution", label: "npm test", startedAt: T0 + 10 * SEC, completedAt: T0 + 40 * SEC },
    { itemId: "i2", turnId: "t1", kind: "commandExecution", label: "git status", startedAt: T0 + 50 * SEC, completedAt: T0 + 51 * SEC },
    { itemId: "i3", turnId: "t1", kind: "fileChange", label: null, startedAt: T0 + 60 * SEC, completedAt: T0 + 61 * SEC },
    { itemId: "i4", turnId: "t2", kind: "commandExecution", label: "npm run build", startedAt: T0 + 130 * SEC, completedAt: null },
  ],
  waits: [],
};

describe("turnSummaries", () => {
  const rows = [
    { at: T0 + 5 * SEC, input: 100, cacheRead: 1_000, output: 50 },
    { at: T0 + 80 * SEC, input: 200, cacheRead: 2_000, output: 70 },
    { at: T0 + 125 * SEC, input: 10, cacheRead: 3_000, output: 5 },
  ];

  it("sums each turn's tokens, commands, and time", () => {
    const [first] = turnSummaries(rows, timings);
    expect(first).toMatchObject({
      turnId: "t1",
      endedAt: T0 + 90 * SEC,
      input: 300,
      cacheRead: 3_000,
      output: 120,
      commands: 2,
      tools: 1,
      time: { model: 58 * SEC, tools: 32 * SEC, waiting: 0 },
    });
  });

  it("counts a running turn's commands before it ends", () => {
    const [, running] = turnSummaries(rows, timings);
    expect(running).toMatchObject({ turnId: "t2", endedAt: null, commands: 1, output: 5, time: null });
  });

  it("gives a turn with no usage yet zero tokens", () => {
    const [, running] = turnSummaries([], timings);
    expect(running).toMatchObject({ input: 0, cacheRead: 0, output: 0, commands: 1 });
  });
});

describe("lastRowByTurn", () => {
  const ids = [
    "thr_w:user-seed:1",
    "thr_w:op:thread-provisioning:3",
    "thr_w:t1:work-summary:thr_w:op:reasoning:kind:reasoning|turn:t1|parent:root|item:i1",
    "thr_w:user-seed:53",
    "thr_w:assistant:kind:assistant|turn:t1|parent:root|item:i11",
    "thr_w:command:i12",
    "thr_w:tool:i14",
    "thr_w:user-seed:109",
    "thr_w:t2:work-summary:thr_w:command:i20",
    "thr_w:assistant:kind:assistant|turn:t2|parent:root|item:i21",
  ];

  it("reads the turn from either kind of row id", () => {
    expect(turnIdOfRow(ids[2]!)).toBe("t1");
    expect(turnIdOfRow(ids[4]!)).toBe("t1");
    expect(turnIdOfRow(ids[5]!)).toBeNull();
  });

  it("puts each summary under the turn's last row, past a message sent mid-turn", () => {
    expect(Object.fromEntries(lastRowByTurn(ids))).toEqual({
      t1: "thr_w:tool:i14",
      t2: "thr_w:assistant:kind:assistant|turn:t2|parent:root|item:i21",
    });
  });

  it("leaves rows before any turn alone", () => {
    expect(lastRowByTurn(ids.slice(0, 2)).size).toBe(0);
  });
});

describe("turnWork", () => {
  it("lists the turn's commands slowest first, running ones before them", () => {
    expect(turnWork(timings, "t1")).toEqual({
      commands: [
        { command: "npm test", ms: 30 * SEC },
        { command: "git status", ms: SEC },
      ],
      moreCommands: 0,
      kinds: [
        { kind: "commandExecution", count: 2, ms: 31 * SEC },
        { kind: "fileChange", count: 1, ms: SEC },
      ],
    });
    expect(turnWork(timings, "t2").commands).toEqual([{ command: "npm run build", ms: null }]);
  });
});
