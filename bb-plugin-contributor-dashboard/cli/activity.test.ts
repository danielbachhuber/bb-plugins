import { describe, expect, it } from "vitest";

import type { PullRequestWithActivity } from "../mirror/github";
import { contributorDashboardCli, parseDay, periodOf, type CliDeps } from "./activity";

const NOW = Date.parse("2026-11-02T12:00:00Z");

const merged: PullRequestWithActivity = {
  id: "PR_1",
  number: 1840,
  title: "Add retry to widget sync",
  url: "https://github.com/acme/widgets/pull/1840",
  state: "MERGED",
  isDraft: false,
  createdAt: "2026-10-05T09:00:00Z",
  updatedAt: "2026-10-06T09:00:00Z",
  closedAt: "2026-10-06T09:00:00Z",
  mergedAt: "2026-10-06T09:00:00Z",
  assignees: [],
  author: { __typename: "User", login: "hubber" },
  reviews: [],
  timelineItems: [],
};

function cli(overrides: Partial<CliDeps> = {}) {
  return contributorDashboardCli({
    repository: "acme/widgets",
    pullRequests: () => [merged],
    issues: () => [],
    teams: () => new Map(),
    sync: () => ({ syncedAt: NOW - 60_000, backfillDone: true }),
    staleAfterMs: 30 * 60_000,
    now: () => NOW,
    ...overrides,
  });
}

describe("parseDay", () => {
  it("reads a day as its local midnight", () => {
    expect(parseDay("2026-10-01")).toBe(Date.parse("2026-10-01T00:00:00Z"));
  });

  it("refuses what is not a real YYYY-MM-DD day", () => {
    expect(parseDay("2026-02-31")).toBeNull();
    expect(parseDay("10/01/2026")).toBeNull();
    expect(parseDay("2026-10-1")).toBeNull();
  });
});

describe("periodOf", () => {
  it("ends at the midnight after the last day, so the last day is included", () => {
    expect(periodOf("2026-10-01", "2026-10-31")).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      start: Date.parse("2026-10-01T00:00:00Z"),
      end: Date.parse("2026-11-01T00:00:00Z"),
    });
  });

  it("allows a single day", () => {
    const { start, end } = periodOf("2026-10-05", "2026-10-05");
    expect(end - start).toBe(86_400_000);
  });

  it("refuses a bad date and a period that ends before it starts", () => {
    expect(() => periodOf("2026-13-01", "2026-10-31")).toThrow(/--from 2026-13-01 is not a date/);
    expect(() => periodOf("2026-10-31", "2026-10-01")).toThrow(/--to 2026-10-01 is before --from 2026-10-31/);
  });
});

describe("bb contributor-dashboard activity", () => {
  it("prints the report as JSON with --json", async () => {
    const result = await cli().run(["activity", "hubber", "--from", "2026-10-01", "--to", "2026-10-31", "--json"], {});
    expect(result.exitCode).toBe(0);
    const report = JSON.parse(result.stdout!);
    expect(report).toMatchObject({
      repository: "acme/widgets",
      login: "hubber",
      known: true,
      period: { from: "2026-10-01", to: "2026-10-31" },
      mirror: { syncedAt: "2026-11-02T11:59:00.000Z", stale: false },
      summary: { pullRequestsOpened: 1, pullRequestsMerged: 1 },
    });
    expect(report.pullRequests[0].number).toBe(1840);
  });

  it("takes a login with a leading @", async () => {
    const result = await cli().run(["activity", "@hubber", "--from", "2026-10-01", "--to", "2026-10-31", "--json"], {});
    expect(JSON.parse(result.stdout!).login).toBe("hubber");
  });

  it("prints a short summary without --json", async () => {
    const result = await cli().run(["activity", "hubber", "--from", "2026-10-01", "--to", "2026-10-31"], {});
    expect(result.stdout).toContain("hubber in acme/widgets, 2026-10-01 to 2026-10-31");
    expect(result.stdout).toContain("Pull requests: 1 opened, 1 merged, 0 closed unmerged");
  });

  it("says when no repository is set", async () => {
    const result = await cli({ repository: null }).run(
      ["activity", "hubber", "--from", "2026-10-01", "--to", "2026-10-31", "--json"],
      {},
    );
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout!).error.code).toBe("not_configured");
  });

  it("reports a bad date as an error rather than a crash", async () => {
    const result = await cli().run(["activity", "hubber", "--from", "October", "--to", "2026-10-31", "--json"], {});
    expect(result.exitCode).not.toBe(0);
    expect(JSON.parse(result.stdout!).error.code).toBe("invalid_date");
  });
});
