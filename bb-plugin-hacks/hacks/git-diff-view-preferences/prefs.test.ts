import { describe, expect, it } from "vitest";
import {
  clicksToApply,
  sameState,
  stateAfter,
  withIntent,
  type ToolbarPrefs,
} from "./prefs";

describe("clicksToApply", () => {
  it("clicks nothing when the toolbar already reads the saved way", () => {
    expect(
      clicksToApply({ wrap: true, view: "split" }, { wrap: true, view: "split" }),
    ).toEqual([]);
  });

  it("clicks wrap when it disagrees", () => {
    expect(
      clicksToApply({ wrap: true }, { wrap: false, view: "unified" }),
    ).toEqual(["wrap"]);
  });

  it("clicks the button for the saved view mode, not a toggle", () => {
    expect(
      clicksToApply({ view: "split" }, { wrap: false, view: "unified" }),
    ).toEqual(["split"]);
    expect(
      clicksToApply({ view: "unified" }, { wrap: false, view: "split" }),
    ).toEqual(["stacked"]);
  });

  it("leaves a control with no saved preference alone", () => {
    // This is what keeps bb's width-driven view-mode default in charge until
    // the user actually picks something.
    expect(clicksToApply({}, { wrap: true, view: "split" })).toEqual([]);
  });

  it("leaves a control bb did not render alone", () => {
    expect(
      clicksToApply({ wrap: true, view: "split" }, { wrap: null, view: null }),
    ).toEqual([]);
  });

  it("fixes both controls at once", () => {
    expect(
      clicksToApply({ wrap: true, view: "split" }, { wrap: false, view: "unified" }),
    ).toEqual(["wrap", "split"]);
  });
});

describe("stateAfter", () => {
  it("predicts where the toolbar lands, since React has not re-rendered yet", () => {
    expect(stateAfter({ wrap: false, view: "unified" }, ["wrap", "split"])).toEqual(
      { wrap: true, view: "split" },
    );
  });

  it("is the identity for no clicks", () => {
    const current = { wrap: true, view: "split" as const };
    expect(stateAfter(current, [])).toEqual(current);
  });

  it("leaves a control bb did not render unknown", () => {
    expect(stateAfter({ wrap: null, view: null }, ["wrap"])).toEqual({
      wrap: null,
      view: null,
    });
  });
});

describe("withIntent", () => {
  it("records what the click asked for", () => {
    expect(withIntent({}, { view: "split" })).toEqual({ view: "split" });
  });

  it("records a choice that matches bb's own default", () => {
    // Picking stacked on a wide panel is a real preference: without it stored,
    // the width-driven default would undo the choice next time.
    expect(withIntent({}, { view: "unified" })).toEqual({ view: "unified" });
  });

  it("leaves the other control alone", () => {
    expect(withIntent({ wrap: true }, { view: "split" })).toEqual({
      wrap: true,
      view: "split",
    });
  });

  it("returns the same object when the click asked for what was stored", () => {
    const prefs: ToolbarPrefs = { wrap: true, view: "split" };
    expect(withIntent(prefs, { view: "split" })).toBe(prefs);
    expect(withIntent(prefs, { wrap: true })).toBe(prefs);
  });
});

describe("sameState", () => {
  it("compares both controls", () => {
    expect(sameState({ wrap: true, view: "split" }, { wrap: true, view: "split" })).toBe(
      true,
    );
    expect(sameState({ wrap: true, view: "split" }, { wrap: false, view: "split" })).toBe(
      false,
    );
    expect(sameState({ wrap: null, view: null }, { wrap: null, view: null })).toBe(true);
  });
});
