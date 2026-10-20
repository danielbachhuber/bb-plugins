import { describe, expect, it } from "vitest";
import {
  canFastForward,
  indicatorFor,
  parseAheadBehind,
  summarizeError,
  type CheckoutStatus,
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
