import { describe, expect, it } from "vitest";
import { checkEntries, summarizeChecks } from "./checks.js";

const run = (name: string, status: string, conclusion: string | null = null, startedAt = "2026-09-01T10:00:00Z") => ({
  __typename: "CheckRun",
  name,
  status,
  conclusion,
  startedAt,
});

describe("summarizeChecks", () => {
  it("is pending while any run is still going", () => {
    expect(
      summarizeChecks([
        run("build", "COMPLETED", "SUCCESS"),
        run("lint", "COMPLETED", "SKIPPED"),
        run("e2e", "IN_PROGRESS"),
      ]),
    ).toEqual({ state: "pending", totalCount: 3, passedCount: 2, failedCount: 0, pendingCount: 1 });
  });

  it("counts only the latest run of a re-run check", () => {
    const checks = summarizeChecks([
      run("build", "COMPLETED", "FAILURE", "2026-09-01T10:00:00Z"),
      run("build", "COMPLETED", "SUCCESS", "2026-09-01T10:05:00Z"),
    ]);
    expect(checks).toMatchObject({ state: "passing", totalCount: 1, passedCount: 1 });
  });

  it("fails on a failing run or status, whatever else is pending", () => {
    expect(
      summarizeChecks([run("build", "QUEUED"), { context: "ci/deploy", state: "ERROR" }]),
    ).toMatchObject({ state: "failing", failedCount: 1, pendingCount: 1 });
    expect(summarizeChecks([run("build", "COMPLETED", "CANCELLED")]).state).toBe("failing");
  });

  it("reads a status context by its state", () => {
    expect(summarizeChecks([{ context: "ci/deploy", state: "SUCCESS" }]).state).toBe("passing");
    expect(summarizeChecks([{ context: "ci/deploy", state: "PENDING" }]).state).toBe("pending");
  });

  it("is no_checks without a rollup", () => {
    expect(summarizeChecks(null).state).toBe("no_checks");
    expect(summarizeChecks([]).state).toBe("no_checks");
  });
});

describe("checkEntries", () => {
  it("lists each check's latest run with its outcome, workflow, and details page", () => {
    expect(
      checkEntries([
        { name: "build", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-01-01T00:00:00Z", workflowName: "Test", detailsUrl: "https://example.test/build/1" },
        { name: "build", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-01-01T00:01:00Z", workflowName: "Test", detailsUrl: "https://example.test/build/2" },
        { name: "unit", status: "COMPLETED", conclusion: "CANCELLED", workflowName: "Test" },
        { name: "lint", status: "COMPLETED", conclusion: "SKIPPED" },
        { context: "deploy", state: "PENDING", targetUrl: "https://example.test/deploy" },
      ]),
    ).toEqual([
      { name: "build", workflow: "Test", outcome: "pass", url: "https://example.test/build/2" },
      { name: "unit", workflow: "Test", outcome: "cancelled" },
      { name: "lint", outcome: "skip" },
      { name: "deploy", outcome: "pending", url: "https://example.test/deploy" },
    ]);
  });
});
