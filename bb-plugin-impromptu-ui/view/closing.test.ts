import { describe, expect, it } from "vitest";
import { allHandled, progressLabel, rowGroups } from "./banner.js";
import { fillTally, openBeforeClosing, tally } from "./closing.js";
import { parseView } from "./schema.js";
import type { StoredView } from "./store.js";
import { firstOpenItem, nextOpenItem } from "./view-panel.js";

const finding = (id: string) => ({ id, title: id, actions: [{ type: "message", label: "Attach", text: `Attach ${id}` }] });
const verdict = {
  id: "verdict",
  title: "Submit as Request changes",
  summary: "Done with the findings: {tally}.",
  closing: true,
  actions: [{ type: "message", label: "Submit review", text: "Submit the review ({tally})." }],
};

function stored(items: StoredView["items"] = {}, sections: unknown[] = [{ items: [verdict, finding("a"), finding("b"), finding("c")] }]): StoredView {
  const view = parseView(JSON.stringify({ title: "Review", sections }));
  return { id: 1, threadId: "thr_story01", key: "default", view, cwd: "/tmp", publishedAt: "2026-03-12T12:00:00Z", hiddenAt: null, items };
}

const done = (label: string) => ({ state: "done" as const, result: { label, at: "2026-03-12T12:05:00Z" } });

describe("closing step", () => {
  it("is left out of the count, and opens only once nothing else is left", () => {
    expect(progressLabel(stored())).toBe("3 of 3 open");
    expect(firstOpenItem(stored())?.id).toBe("a");
    expect(nextOpenItem(stored(), "c")?.id).toBe("a");
    const rest = stored({ a: done("Attach"), b: done("Attach"), c: { state: "dismissed", result: null } });
    expect(firstOpenItem(rest)?.id).toBe("verdict");
    expect(nextOpenItem(rest, "c")?.id).toBe("verdict");
    // Every finding handled is not the end: the view stays open for the verdict.
    expect(allHandled(rest)).toBe(false);
  });

  it("counts what is left and tallies what was done", () => {
    const some = stored({ a: done("Attach"), c: { state: "dismissed", result: null } });
    expect(openBeforeClosing(some)).toBe(1);
    expect(tally(some)).toBe("1 Attach, 1 open, 1 dismissed");
    expect(fillTally("Submit ({tally})", some)).toBe("Submit (1 Attach, 1 open, 1 dismissed)");
    expect(fillTally("No tally here", some)).toBe("No tally here");
  });

  it("allows one closing step, and only in the cards layout", () => {
    expect(() => stored({}, [{ items: [verdict, { ...verdict, id: "verdict-2" }] }])).toThrow(/at most one closing step/);
    expect(() => parseView(JSON.stringify({ title: "List", layout: "list", sections: [{ items: [verdict] }] }))).toThrow(/closing step needs the "cards" layout/);
  });
});

describe("row groups", () => {
  it("groups rows under titled sections, open first, and leaves untitled views as one list", () => {
    const titled = stored({ a: done("Attach") }, [
      { title: "Fix before merge", items: [finding("a"), finding("b")] },
      { title: "Worth considering", items: [finding("c")] },
      { items: [verdict] },
    ]);
    expect(rowGroups(titled).map((group) => [group.title, group.items.map((item) => item.id)])).toEqual([
      ["Fix before merge", ["b", "a"]],
      ["Worth considering", ["c"]],
    ]);
    expect(rowGroups(stored({ a: done("Attach") })).map((group) => [group.title, group.items.map((item) => item.id)])).toEqual([["", ["b", "c", "a"]]]);
  });
});
