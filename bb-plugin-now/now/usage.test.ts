import { describe, expect, it } from "vitest";

import { createCallLog, gwsService, rateLimitOf } from "./usage.js";

const START = Date.UTC(2026, 9, 9, 18, 0, 0);
const RESET = "2026-10-09T18:40:00Z";

function clock() {
  let time = START;
  return { now: () => time, advance: (ms: number) => (time += ms) };
}

describe("gwsService", () => {
  it("names the service from the command", () => {
    expect(gwsService(["gmail", "users", "threads", "list"])).toBe("Gmail");
    expect(gwsService(["calendar", "events", "get"])).toBe("Calendar");
    expect(gwsService(["auth", "status"])).toBe("Google");
  });
});

describe("rateLimitOf", () => {
  it("reads the query's cost and the budget", () => {
    const stdout = JSON.stringify({ data: { rateLimit: { cost: 2, used: 1900, limit: 5000, resetAt: RESET }, r0: {} } });
    expect(rateLimitOf(stdout)).toEqual({ cost: 2, budget: { used: 1900, limit: 5000, resetAt: Date.parse(RESET) } });
  });

  it("returns null for a response without it", () => {
    expect(rateLimitOf('{"data":{}}')).toBeNull();
    expect(rateLimitOf('"rateLimit" but not JSON')).toBeNull();
  });
});

describe("createCallLog", () => {
  it("counts a sync's calls by service, and the clicks outside it", async () => {
    const time = clock();
    const log = createCallLog(time.now);
    const gws = log.countRunner(async () => "{}", gwsService);
    const gh = log.countRunner(
      async () => JSON.stringify({ data: { rateLimit: { cost: 3, used: 10, limit: 5000, resetAt: RESET } } }),
      () => "GitHub",
    );
    const todoist = log.countFetch((async () => new Response("{}")) as typeof fetch, "Todoist");

    const done = log.startSync();
    await todoist("https://example.test/tasks");
    await gws(["gmail", "users", "threads", "list"]);
    await gws(["gmail", "users", "threads", "get"]);
    await gws(["calendar", "events", "get"]);
    await gh(["api", "graphql"]);
    time.advance(4_000);
    done();

    time.advance(60_000);
    await todoist("https://example.test/close");
    await gws(["gmail", "users", "threads", "modify"]);

    expect(log.snapshot()).toEqual({
      syncs: [
        { at: START, ms: 4_000, calls: 5, points: 3, services: { Todoist: 1, Gmail: 2, Calendar: 1, GitHub: 1 } },
      ],
      budget: { used: 10, limit: 5000, resetAt: Date.parse(RESET) },
      otherCalls: { Todoist: 1, Gmail: 1 },
    });
  });

  it("reads the cost from a partial GraphQL error", async () => {
    const log = createCallLog(clock().now);
    const gh = log.countRunner(async () => {
      throw Object.assign(new Error("partial"), {
        stdout: JSON.stringify({ data: { rateLimit: { cost: 1, used: 5, limit: 5000, resetAt: RESET } } }),
      });
    }, () => "GitHub");
    const done = log.startSync();
    await expect(gh(["api", "graphql"])).rejects.toThrow("partial");
    done();
    expect(log.snapshot().syncs[0]).toMatchObject({ points: 1, services: { GitHub: 1 } });
  });

  it("leaves out a sync still running, and forgets the hour before", async () => {
    const time = clock();
    const log = createCallLog(time.now);
    const gws = log.countRunner(async () => "{}", gwsService);
    await gws(["gmail", "users", "threads", "list"]);
    time.advance(2 * 3_600_000);
    log.startSync();
    await gws(["gmail", "users", "threads", "list"]);
    expect(log.snapshot()).toMatchObject({ syncs: [], otherCalls: {} });
  });
});
