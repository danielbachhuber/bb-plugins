import { describe, expect, it } from "vitest";
import {
  optionForText,
  restoreDecision,
  SETTLE_MS,
  type RangeOption,
} from "./rules";

const ALL: RangeOption = { value: "all", label: "All changes" };
const COMMITTED: RangeOption = {
  value: "branch_committed",
  label: "Committed changes",
};
const UNCOMMITTED: RangeOption = {
  value: "uncommitted",
  label: "Uncommitted changes",
};
const COMMIT: RangeOption = {
  value: "abc1234def",
  label: "Add the widget",
  monoPrefix: "abc1234",
};

describe("optionForText", () => {
  it("matches a fixed range by its label", () => {
    expect(optionForText([ALL, UNCOMMITTED], " Uncommitted changes ")).toBe(
      UNCOMMITTED,
    );
  });

  it("matches a commit by its short SHA and subject run together", () => {
    expect(optionForText([ALL, COMMIT], "abc1234Add the widget")).toBe(COMMIT);
  });

  it("matches nothing for an item another plugin added", () => {
    expect(optionForText([ALL, UNCOMMITTED], "Only unviewed")).toBeUndefined();
  });
});

describe("restoreDecision", () => {
  const options = [ALL, COMMITTED, UNCOMMITTED];

  it("selects the stored range once it is listed", () => {
    expect(
      restoreDecision({
        stored: UNCOMMITTED.value,
        value: "all",
        options,
        sinceArrivalMs: 0,
      }),
    ).toEqual({ kind: "apply" });
  });

  it("waits while only All changes is listed, since the status may not have loaded", () => {
    expect(
      restoreDecision({
        stored: UNCOMMITTED.value,
        value: "all",
        options: [ALL],
        sinceArrivalMs: 10_000,
      }),
    ).toEqual({ kind: "wait" });
  });

  it("gives up once ranges have loaded without the stored one", () => {
    expect(
      restoreDecision({
        stored: UNCOMMITTED.value,
        value: "all",
        options: [ALL, COMMITTED],
        sinceArrivalMs: 0,
      }),
    ).toEqual({ kind: "give-up" });
  });

  it("does not trust a match until the settle window has passed", () => {
    const input = { stored: UNCOMMITTED.value, value: UNCOMMITTED.value, options };
    expect(restoreDecision({ ...input, sinceArrivalMs: 0 })).toEqual({
      kind: "wait",
    });
    expect(restoreDecision({ ...input, sinceArrivalMs: SETTLE_MS })).toEqual({
      kind: "done",
    });
  });
});
