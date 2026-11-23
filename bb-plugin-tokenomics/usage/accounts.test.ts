import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { accountName, accountStretches, formatAccounts } from "./accounts.js";
import type { LimitSample } from "./limits.js";
import { createStore, MIGRATIONS } from "./store.js";

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 20, 12, 0);

function reading(minute: number, accountKey: string | null, over: Partial<LimitSample> = {}): LimitSample {
  return {
    providerId: "claude-code",
    accountKey,
    label: "Weekly limit",
    kind: "weekly",
    model: null,
    sampledAt: T0 + minute * MIN,
    usedPercent: 10,
    resetsAt: T0 + 7 * 24 * 60 * MIN,
    ...over,
  };
}

describe("accountStretches", () => {
  it("hands the calls between two accounts' readings to the later one", () => {
    const samples = [reading(0, "acct_acme"), reading(5, "acct_acme"), reading(10, "acct_gadgets"), reading(15, "acct_gadgets")];
    expect(accountStretches(samples)).toEqual([
      { providerId: "claude-code", accountKey: "acct_acme", from: T0, to: T0 + 5 * MIN },
      { providerId: "claude-code", accountKey: "acct_gadgets", from: T0 + 5 * MIN, to: T0 + 15 * MIN },
    ]);
  });

  it("counts readings of several windows at one time once", () => {
    const samples = [reading(0, "acct_acme"), reading(0, "acct_acme", { label: "Current session" }), reading(5, "acct_acme")];
    expect(accountStretches(samples)).toEqual([{ providerId: "claude-code", accountKey: "acct_acme", from: T0, to: T0 + 5 * MIN }]);
  });

  it("gives no stretch to a reading without an account, or to another provider's", () => {
    const samples = [
      reading(0, "acct_acme"),
      reading(5, null),
      reading(10, "acct_acme"),
      reading(15, "acct_acme"),
      reading(12, "acct_widgets", { providerId: "codex" }),
      reading(17, "acct_widgets", { providerId: "codex" }),
    ];
    expect(accountStretches(samples)).toEqual([
      { providerId: "claude-code", accountKey: "acct_acme", from: T0 + 5 * MIN, to: T0 + 15 * MIN },
      { providerId: "codex", accountKey: "acct_widgets", from: T0 + 12 * MIN, to: T0 + 17 * MIN },
    ]);
  });
});

describe("stampAccounts", () => {
  it("stamps each call once, by provider, and leaves calls outside every stretch unknown", () => {
    const db = new Database(":memory:");
    for (const statement of MIGRATIONS) db.exec(statement);
    const store = createStore(db);
    const tokens = { input: 10, cacheRead: 80, output: 10 };
    const row = (id: string, minute: number) => ({ eventId: id, createdAt: T0 + minute * MIN, tokens, runningTotal: 0, cacheTtlMs: null });
    const thread = (threadId: string, providerId: string) => ({ threadId, title: null, projectId: "proj", providerId, archivedAt: null, origin: null });
    store.record(thread("thr_widgets", "claude-code"), [row("e1", -2), row("e2", 3), row("e3", 8), row("e4", 20)], 4);
    store.record(thread("thr_gadgets", "codex"), [row("e5", 3)], 1);
    store.recordSubagents("thr_widgets", [
      { path: "/tmp/a.jsonl", agentId: "a1", description: null, offset: 1, calls: [{ messageId: "m1", createdAt: T0 + 9 * MIN, ...tokens }] },
    ]);

    const stretches = accountStretches([reading(0, "acct_acme"), reading(5, "acct_acme"), reading(10, "acct_gadgets")]);
    expect(store.stampAccounts(stretches)).toBe(3);
    expect(store.stampAccounts(stretches)).toBe(0);

    const days = store.accountDays(T0 - 60 * MIN).map(({ providerId, accountKey, tokens }) => [providerId, accountKey, tokens]);
    expect(days).toEqual(
      expect.arrayContaining([
        ["claude-code", "acct_acme", 100],
        ["claude-code", "acct_gadgets", 200],
        ["claude-code", null, 200],
        ["codex", null, 100],
      ]),
    );
  });
});

describe("formatAccounts", () => {
  it("lists known accounts by tokens, marks the one signed in now, and explains unknown calls", () => {
    const text = formatAccounts(
      [
        { day: "2026-10-19", providerId: "claude-code", accountKey: null, tokens: 5_000_000 },
        { day: "2026-10-20", providerId: "claude-code", accountKey: "anthropic:account:aaaa1111-2222", tokens: 2_000_000_000 },
        { day: "2026-10-20", providerId: "claude-code", accountKey: "anthropic:account:bbbb3333-4444", tokens: 40_000_000 },
      ],
      [
        { providerId: "claude-code", accountKey: "anthropic:account:aaaa1111-2222", usedPercent: 79, resetsAt: 0, sampledAt: 1 },
        { providerId: "claude-code", accountKey: "anthropic:account:bbbb3333-4444", usedPercent: 13, resetsAt: 0, sampledAt: 2 },
      ],
      7,
    );
    expect(text).toContain("claude-code · account aaaa1111  2.00B tokens (weekly limit 79%)");
    expect(text).toContain("claude-code · account bbbb3333  40.0M tokens (weekly limit 13%, signed in now)");
    expect(text.indexOf("account bbbb3333")).toBeLessThan(text.indexOf("not known  5.0M"));
    expect(text).toMatch(/Tue 20 Oct\s+2\.00B\s+40\.0M\s+-/);
    expect(text).toContain("Not known:");
  });

  it("names an account by the start of its id", () => {
    expect(accountName("anthropic:account:50c0ffee-1234")).toBe("account 50c0ffee");
    expect(accountName(null)).toBe("not known");
  });
});
