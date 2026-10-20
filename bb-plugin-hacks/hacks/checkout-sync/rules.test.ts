import { describe, expect, it } from "vitest";
import {
  canFastForward,
  findSyncScript,
  indicatorFor,
  parseAheadBehind,
  parseRunState,
  shouldRunScript,
  STARTING_GRACE_MS,
  summarizeError,
  type CheckoutStatus,
  type ScriptRun,
} from "./rules";

const status = (overrides: Partial<CheckoutStatus> = {}): CheckoutStatus => ({
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  error: null,
  ...overrides,
});

describe("parseAheadBehind", () => {
  it("reads ahead, then behind", () => {
    expect(parseAheadBehind("1\t3\n")).toEqual({ ahead: 1, behind: 3 });
  });

  it("rejects anything else", () => {
    expect(parseAheadBehind("")).toBeNull();
    expect(parseAheadBehind("fatal: no upstream")).toBeNull();
  });
});

describe("summarizeError", () => {
  it("keeps git's first line without its prefix", () => {
    expect(
      summarizeError(
        "error: Your local changes to the following files would be overwritten by merge:\n\tREADME.md\n",
      ),
    ).toBe("Your local changes to the following files would be overwritten by merge:");
  });

  it("skips Node's command line", () => {
    expect(summarizeError("Command failed: git fetch\nfatal: unable to access remote")).toBe(
      "unable to access remote",
    );
  });
});

describe("indicatorFor", () => {
  it("names the counts and what a click does", () => {
    expect(indicatorFor("widgets", status())).toEqual({
      tone: "synced",
      label: "widgets: main is up to date with origin/main. Click to fetch.",
    });
    expect(indicatorFor("widgets", status({ behind: 1 }))).toEqual({
      tone: "behind",
      label: "widgets: main is 1 commit behind origin/main. Click to pull.",
    });
    expect(indicatorFor("widgets", status({ ahead: 2 })).tone).toBe("ahead");
    expect(indicatorFor("widgets", status({ ahead: 2, behind: 3 })).tone).toBe("diverged");
  });

  it("puts a failure ahead of the counts", () => {
    expect(indicatorFor("widgets", status({ behind: 3, error: "no network" }))).toEqual({
      tone: "error",
      label: "widgets: could not update main from origin/main: no network. Click to try again.",
    });
  });
});

describe("canFastForward", () => {
  it("only when behind and not ahead", () => {
    expect(canFastForward(status({ behind: 2 }))).toBe(true);
    expect(canFastForward(status({ behind: 2, ahead: 1 }))).toBe(false);
    expect(canFastForward(status())).toBe(false);
  });
});

const run = (overrides: Partial<ScriptRun> = {}): ScriptRun => ({
  script: "sync.sh",
  state: "succeeded",
  exitCode: 0,
  log: "/tmp/sync.log",
  ...overrides,
});

describe("findSyncScript", () => {
  it("takes the first known place that exists", () => {
    expect(findSyncScript((path) => path === "sync.sh" || path === "scripts/sync.sh")).toBe("sync.sh");
    expect(findSyncScript(() => true)).toBe(".bb/sync");
    expect(findSyncScript(() => false)).toBeNull();
  });
});

describe("shouldRunScript", () => {
  it("runs after a pull that moved the branch", () => {
    expect(shouldRunScript(true, null)).toBe(true);
    expect(shouldRunScript(true, run())).toBe(true);
  });

  it("does not run when nothing was pulled, unless the last run failed", () => {
    expect(shouldRunScript(false, null)).toBe(false);
    expect(shouldRunScript(false, run())).toBe(false);
    expect(shouldRunScript(false, run({ state: "failed", exitCode: 1 }))).toBe(true);
  });

  it("never starts a second run", () => {
    expect(shouldRunScript(true, run({ state: "running", exitCode: null }))).toBe(false);
  });
});

describe("parseRunState", () => {
  const alive = (pid: number) => pid === 42;

  it("reads a running script by whether its process is alive", () => {
    expect(parseRunState("running 42\n", 0, alive)).toEqual({ state: "running", exitCode: null });
    expect(parseRunState("running 7\n", 0, alive)).toEqual({ state: "failed", exitCode: null });
  });

  it("reads an exit code", () => {
    expect(parseRunState("exit 0\n", 0, alive)).toEqual({ state: "succeeded", exitCode: 0 });
    expect(parseRunState("exit 3\n", 0, alive)).toEqual({ state: "failed", exitCode: 3 });
  });

  it("gives a run that has not recorded its pid a short grace period", () => {
    expect(parseRunState("starting\n", 0, alive)).toEqual({ state: "running", exitCode: null });
    expect(parseRunState("starting\n", STARTING_GRACE_MS, alive)).toEqual({ state: "failed", exitCode: null });
  });

  it("ignores anything else", () => {
    expect(parseRunState("", 0, alive)).toBeNull();
    expect(parseRunState("exit", 0, alive)).toBeNull();
  });
});

describe("indicatorFor with a sync script", () => {
  it("shows a running script", () => {
    expect(indicatorFor("widgets", status(), run({ state: "running", exitCode: null }))).toEqual({
      tone: "running",
      label: "widgets: running sync.sh. Output: /tmp/sync.log",
    });
  });

  it("shows a failed script as an error, with its log", () => {
    expect(indicatorFor("widgets", status(), run({ state: "failed", exitCode: 1 }))).toEqual({
      tone: "error",
      label: "widgets: sync.sh failed with exit code 1. Output: /tmp/sync.log. Click to run it again.",
    });
  });

  it("lets a git error win over the script", () => {
    expect(
      indicatorFor("widgets", status({ error: "boom" }), run({ state: "failed", exitCode: 1 })).label,
    ).toContain("could not update");
  });

  it("says nothing about a script that succeeded", () => {
    expect(indicatorFor("widgets", status(), run()).tone).toBe("synced");
  });
});
