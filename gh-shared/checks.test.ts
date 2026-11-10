import { describe, expect, it } from "vitest";

import { checkEntries, checkOutcome, countChecks, failingCheckNames, latestChecks } from "./checks.js";

describe("latestChecks", () => {
  const run = (name: string, conclusion: string, startedAt: string | null) => ({
    __typename: "CheckRun",
    name,
    status: "COMPLETED",
    conclusion,
    startedAt,
  });

  it("keeps only the latest run of a re-run check", () => {
    // The exact shape that made #5850 read "1 fail" while it was green: a
    // check failed, was re-run twenty seconds later, and GitHub returned both.
    const rollup = [
      run("Validate PR title", "FAILURE", "2026-08-28T12:38:14Z"),
      run("Validate PR title", "SUCCESS", "2026-08-28T12:38:34Z"),
    ];
    expect(latestChecks(rollup)).toEqual([rollup[1]]);
    expect(countChecks(checkEntries(rollup))).toMatchObject({ pass: 1, fail: 0, total: 1 });
  });

  it("does not care which order the rollup returns them in", () => {
    const later = run("Build", "SUCCESS", "2026-08-28T12:38:34Z");
    const earlier = run("Build", "FAILURE", "2026-08-28T12:38:14Z");
    expect(latestChecks([later, earlier])).toEqual([later]);
    expect(latestChecks([earlier, later])).toEqual([later]);
  });

  it("collapses a repeat that passed both times, so the count is not doubled", () => {
    const rollup = [
      run("Identify changed files", "SUCCESS", "2026-08-28T12:38:14Z"),
      run("Identify changed files", "SUCCESS", "2026-08-28T12:38:14Z"),
    ];
    expect(countChecks(checkEntries(rollup))).toMatchObject({ pass: 1, total: 1 });
  });

  it("keeps checks with different names apart", () => {
    const rollup = [
      run("Lint", "FAILURE", "2026-08-28T12:38:14Z"),
      run("Test", "SUCCESS", "2026-08-28T12:38:14Z"),
    ];
    expect(latestChecks(rollup)).toHaveLength(2);
    expect(countChecks(checkEntries(rollup))).toMatchObject({ pass: 1, fail: 1, total: 2 });
  });

  it("identifies a StatusContext by its context, since it has no name", () => {
    const rollup = [
      { __typename: "StatusContext", context: "ci/circleci", state: "FAILURE" },
      { __typename: "StatusContext", context: "ci/circleci", state: "SUCCESS" },
    ];
    expect(latestChecks(rollup)).toHaveLength(1);
  });

  it("prefers a dated run over an undated one", () => {
    const dated = run("Build", "SUCCESS", "2026-08-28T12:38:34Z");
    const undated = run("Build", "FAILURE", null);
    expect(latestChecks([undated, dated])).toEqual([dated]);
    expect(latestChecks([dated, undated])).toEqual([dated]);
  });

  it("keeps every nameless entry rather than collapsing them together", () => {
    // Two anonymous entries are two checks, not one seen twice. Collapsing
    // them would hide a failure behind an unrelated success.
    const rollup = [
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
      { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
    ];
    expect(latestChecks(rollup)).toHaveLength(2);
    expect(countChecks(checkEntries(rollup))).toMatchObject({ pass: 1, fail: 1, total: 2 });
  });

  it("leaves a rollup with no repeats untouched", () => {
    expect(latestChecks([])).toEqual([]);
    expect(latestChecks(null)).toEqual([]);
  });
});

describe("checkOutcome", () => {
  const run = (status: string, conclusion: string | null) => ({ __typename: "CheckRun", name: "x", status, conclusion });

  it("reads a CheckRun by its conclusion once it completes", () => {
    expect(checkOutcome(run("COMPLETED", "SUCCESS"))).toBe("pass");
    expect(checkOutcome(run("COMPLETED", "NEUTRAL"))).toBe("skip");
    expect(checkOutcome(run("COMPLETED", "SKIPPED"))).toBe("skip");
    expect(checkOutcome(run("COMPLETED", "CANCELLED"))).toBe("cancelled");
    expect(checkOutcome(run("COMPLETED", "TIMED_OUT"))).toBe("fail");
    expect(checkOutcome(run("IN_PROGRESS", null))).toBe("pending");
  });

  it("counts a conclusion it does not know as still running, never a pass", () => {
    expect(checkOutcome(run("COMPLETED", "SOMETHING_NEW"))).toBe("pending");
  });

  it("reads a StatusContext by its state", () => {
    expect(checkOutcome({ context: "ci", state: "SUCCESS" })).toBe("pass");
    expect(checkOutcome({ context: "ci", state: "EXPECTED" })).toBe("pending");
    expect(checkOutcome({ context: "ci", state: "ERROR" })).toBe("fail");
  });
});

describe("checkEntries", () => {
  it("reads gh's flat form", () => {
    expect(
      checkEntries([
        { __typename: "CheckRun", name: "build", status: "COMPLETED", conclusion: "SUCCESS", workflowName: "Test", detailsUrl: "https://example.test/build" },
        { __typename: "StatusContext", context: "deploy", state: "PENDING", targetUrl: "https://example.test/deploy" },
      ]),
    ).toEqual([
      { name: "build", workflow: "Test", outcome: "pass", url: "https://example.test/build" },
      { name: "deploy", outcome: "pending", url: "https://example.test/deploy" },
    ]);
  });

  it("reads GraphQL's nested workflow, and skips null nodes", () => {
    expect(
      checkEntries([
        null,
        { __typename: "CheckRun", name: "unit", status: "COMPLETED", conclusion: "CANCELLED", checkSuite: { workflowRun: { workflow: { name: "Test" } } } },
      ]),
    ).toEqual([{ name: "unit", workflow: "Test", outcome: "cancelled" }]);
  });

  it("counts a run a newer push cancelled and a re-run passed as passing", () => {
    const rollup = [
      { name: "build", status: "COMPLETED", conclusion: "CANCELLED", startedAt: "2026-01-01T00:00:00Z" },
      { name: "build", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-01-01T00:00:04Z" },
    ];
    expect(countChecks(checkEntries(rollup))).toEqual({ pass: 1, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 1 });
  });
});

describe("failingCheckNames", () => {
  it("names the checks failing on their latest run, sorted", () => {
    expect(
      failingCheckNames([
        { name: "lint", status: "COMPLETED", conclusion: "FAILURE" },
        { name: "build", status: "COMPLETED", conclusion: "FAILURE", startedAt: "2026-01-01T00:00:00Z" },
        { name: "build", status: "COMPLETED", conclusion: "SUCCESS", startedAt: "2026-01-01T00:01:00Z" },
        { name: "audit", status: "COMPLETED", conclusion: "TIMED_OUT" },
      ]),
    ).toEqual(["audit", "lint"]);
  });
});
