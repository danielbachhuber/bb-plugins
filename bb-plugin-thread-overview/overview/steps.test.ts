import { describe, expect, it } from "vitest";
import {
  collapsedLine,
  headerAriaLabel,
  isQuiet,
  newTexts,
  nextStatus,
  normalizeSummary,
  normalizeText,
  opensExpanded,
  progress,
  renderForAgent,
  resolveRefs,
  statusChanges,
  stepCount,
  updatedLabel,
  stepColumn,
} from "./steps.js";
import type { Step, StepStatus } from "./types.js";

let position = 0;
function step(text: string, status: StepStatus = "todo", id = `s${++position}`): Step {
  return {
    id,
    threadId: "t1",
    text,
    status,
    source: "agent",
    position,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("normalizeText", () => {
  it("strips bullets and collapses whitespace", () => {
    expect(normalizeText("  - Write   the parser ")).toBe("Write the parser");
    expect(normalizeText("2) Open a PR")).toBe("Open a PR");
  });

  it("elides past the limit", () => {
    const text = normalizeText("x".repeat(600));
    expect(text).toHaveLength(500);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("normalizeSummary", () => {
  it("joins the lines a model wraps its prose onto", () => {
    expect(normalizeSummary("Add a CSV export.\nFinance wants it.")).toBe(
      "Add a CSV export. Finance wants it.",
    );
  });
});

describe("newTexts", () => {
  it("skips steps already on the plan, ignoring case and punctuation", () => {
    const existing = [step("Write the export")];
    expect(newTexts(existing, ["write the export.", "Open a PR"])).toEqual(["Open a PR"]);
  });

  it("allows re-adding a finished step", () => {
    expect(newTexts([step("Write the export", "done")], ["Write the export"])).toEqual([
      "Write the export",
    ]);
  });

  it("drops entries with no words and duplicates within one call", () => {
    expect(newTexts([], ["---", "Open a PR", "open a pr"])).toEqual(["Open a PR"]);
  });
});

describe("resolveRefs", () => {
  const steps = [step("Write the export", "todo", "a1"), step("Write the docs", "todo", "b2")];

  it("matches by id, then text, then unique prefix", () => {
    expect(resolveRefs(steps, ["a1"]).matched.map((s) => s.id)).toEqual(["a1"]);
    expect(resolveRefs(steps, ["write the docs"]).matched.map((s) => s.id)).toEqual(["b2"]);
    expect(resolveRefs(steps, ["Write the ex"]).matched.map((s) => s.id)).toEqual(["a1"]);
  });

  it("reports an ambiguous prefix as unmatched instead of guessing", () => {
    expect(resolveRefs(steps, ["Write"])).toEqual({ matched: [], unmatched: ["Write"] });
  });
});

describe("statusChanges", () => {
  it("keeps one step current", () => {
    const a = step("A", "current");
    const b = step("B");
    expect(statusChanges([a, b], [b], "current")).toEqual([
      { id: a.id, status: "todo" },
      { id: b.id, status: "current" },
    ]);
  });

  it("lets the last of several targets become current", () => {
    const a = step("A");
    const b = step("B");
    expect(statusChanges([a, b], [a, b], "current")).toEqual([{ id: b.id, status: "current" }]);
  });

  it("reports nothing for a step already in the asked status", () => {
    const a = step("A", "done");
    expect(statusChanges([a], [a], "done")).toEqual([]);
  });
});

describe("nextStatus", () => {
  it("cycles todo, current, done", () => {
    expect(["todo", "current", "done"].map((s) => nextStatus(s as StepStatus))).toEqual([
      "current",
      "done",
      "todo",
    ]);
  });
});

describe("progress", () => {
  it("uses the current step when there is one", () => {
    const steps = [step("A", "done"), step("B"), step("C", "current")];
    expect(progress(steps)).toMatchObject({ done: 1, total: 3, number: 3 });
    expect(stepCount(steps)).toBe("3/3");
  });

  it("falls back to the first unfinished step", () => {
    const steps = [step("A", "done"), step("B"), step("C")];
    expect(progress(steps).current?.text).toBe("B");
    expect(stepCount(steps)).toBe("2/3");
  });

  it("says all done when nothing is left", () => {
    const steps = [step("A", "done"), step("B", "done")];
    expect(progress(steps).number).toBeNull();
    expect(stepCount(steps)).toBe("2/2");
    expect(collapsedLine({ summary: "", steps }).step).toBe("All steps done");
  });
});

describe("opensExpanded", () => {
  it("honours a collapse until the agent changes something", () => {
    expect(opensExpanded({ collapsed: true, agentUpdatedAt: 10, seenAt: 20 })).toBe(false);
    expect(opensExpanded({ collapsed: true, agentUpdatedAt: 30, seenAt: 20 })).toBe(true);
    expect(opensExpanded({ collapsed: false, agentUpdatedAt: 0, seenAt: 0 })).toBe(true);
  });
});

describe("updatedLabel", () => {
  const now = 10 * 24 * 3_600_000;
  it("reads in the largest sensible unit", () => {
    expect(updatedLabel(now - 30_000, now)).toBe("updated just now");
    expect(updatedLabel(now - 12 * 60_000, now)).toBe("updated 12 min ago");
    expect(updatedLabel(now - 3 * 3_600_000, now)).toBe("updated 3 h ago");
    expect(updatedLabel(now - 24 * 3_600_000, now)).toBe("updated 1 day ago");
    expect(updatedLabel(0, now)).toBe("");
  });
});

describe("headerAriaLabel", () => {
  it("names the step aloud", () => {
    const steps = [step("A", "done"), step("B", "current")];
    expect(headerAriaLabel({ summary: "x", steps })).toBe("Thread overview: step 2 of 2, B");
    expect(headerAriaLabel({ summary: "", steps: [] })).toBe("Thread overview: none yet");
  });
});

describe("renderForAgent", () => {
  it("shows the summary, marks, and ids", () => {
    const text = renderForAgent({
      summary: "Add a CSV export.",
      steps: [step("A", "done", "x1"), step("B", "current", "x2")],
    });
    expect(text).toContain("Summary: Add a CSV export.");
    expect(text).toContain("[x] x1  A");
    expect(text).toContain("[>] x2  B");
    expect(text).toContain("1 of 2 done.");
  });

  it("says when nothing is written yet", () => {
    expect(renderForAgent({ summary: "", steps: [] })).toBe(
      "Summary: (none yet)\n\nSteps:\n(none yet)",
    );
  });
});

describe("stepColumn", () => {
  it("puts unfinished steps first in plan order, then finished ones newest first", () => {
    const a = { ...step("A", "done"), updatedAt: 10 };
    const b = step("B", "current");
    const c = { ...step("C", "done"), updatedAt: 30 };
    const d = step("D");
    const column = stepColumn([a, b, c, d]);
    expect(column.unfinished.map((s) => s.text)).toEqual(["B", "D"]);
    expect(column.finished.map((s) => s.text)).toEqual(["C", "A"]);
  });
});

describe("isQuiet", () => {
  it("is quiet with no summary and nothing left to do", () => {
    expect(isQuiet({ summary: "", steps: [] })).toBe(true);
    expect(isQuiet({ summary: "", steps: [step("A", "done")] })).toBe(true);
    expect(isQuiet({ summary: "", steps: [step("A", "done"), step("B")] })).toBe(false);
    expect(isQuiet({ summary: "Something.", steps: [step("A", "done")] })).toBe(false);
  });
});
