import { describe, expect, it } from "vitest";
import { resolveGrouping } from "./check";
import { isMechanical } from "./classify";
import type { ReviewView } from "./contract";
import type { Grouping } from "./grouping";
import { itemsOf, parseDiff } from "./items";
import { buildView, placeItems, type StoredGrouping } from "./view";

function fileDiff(path: string, bodies: string[]): string {
  const hunks = bodies.map((body, i) => `@@ -${i * 10 + 1},1 +${i * 10 + 1},1 @@\n-old ${body}\n+new ${body}\n`).join("");
  return `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n${hunks}`;
}

const DIFF =
  fileDiff("src/widget.ts", ["one", "two", "three"]) +
  fileDiff("src/gadget.ts", ["four"]) +
  fileDiff("package-lock.json", ["five"]);

const GROUPING: Grouping = {
  headline: "Widgets call the sprocket.",
  concerns: [
    { title: "Sprocket", note: "Adds it.", files: [{ path: "src/widget.ts", hunks: [0, 2] }] },
    { title: "Call site", note: "Uses it.", files: [{ path: "src/widget.ts", hunks: [1] }, "src/gadget.ts"] },
  ],
};

function stored(diff: string): StoredGrouping {
  const { assignments, violations } = resolveGrouping(itemsOf(parseDiff(diff)), GROUPING, isMechanical);
  expect(violations).toEqual([]);
  return { grouping: GROUPING, assignments, baseSha: "base", headSha: "head", groupedAt: "2026-10-05T12:00:00.000Z" };
}

/** Every non-removed hunk in the view, as `path#index`, once per appearance. */
function shown(view: ReviewView): string[] {
  const sections = [...view.concerns, view.notYetGrouped, view.mechanical].filter((s) => s !== null);
  return sections.flatMap((s) => s.files.flatMap((f) => f.hunks.filter((h) => h.status !== "removed").map((h) => `${h.path}#${h.index}`)));
}

function expectEveryItemOnce(view: ReviewView, diff: string) {
  const expected = itemsOf(parseDiff(diff)).map((i) => `${i.path}#${i.index}`).sort();
  expect(shown(view).sort()).toEqual(expected);
  expect(view.coverage).toEqual({ files: parseDiff(diff).length, hunks: expected.length, shown: expected.length });
}

describe("buildView", () => {
  it("before any grouping, puts everything in Not yet grouped and Mechanical", () => {
    const view = buildView(parseDiff(DIFF), null, null);
    expect(view.headline).toBeNull();
    expect(view.concerns).toEqual([]);
    expect(view.notYetGrouped!.files.map((f) => f.path)).toEqual(["src/widget.ts", "src/gadget.ts"]);
    expect(view.mechanical!.files.map((f) => f.path)).toEqual(["package-lock.json"]);
    expectEveryItemOnce(view, DIFF);
  });

  it("places each hunk in its concern, in grouping order", () => {
    const view = buildView(parseDiff(DIFF), stored(DIFF), null);
    expect(view.headline).toBe("Widgets call the sprocket.");
    expect(view.concerns.map((c) => c.title)).toEqual(["Sprocket", "Call site"]);
    expect(view.concerns[0]!.files[0]!.hunks.map((h) => h.index)).toEqual([0, 2]);
    expect(view.concerns[0]!.files[0]!.total).toBe(3);
    expect(view.notYetGrouped).toBeNull();
    expectEveryItemOnce(view, DIFF);
  });

  it("after an edit, badges the changed hunk and keeps it in its concern", () => {
    const edited = DIFF.replace("+new two", "+newer two");
    const view = buildView(parseDiff(edited), stored(DIFF), null);
    const hunk = view.concerns[1]!.files[0]!.hunks[0]!;
    expect([hunk.path, hunk.index, hunk.status]).toEqual(["src/widget.ts", 1, "changed"]);
    expectEveryItemOnce(view, edited);
  });

  it("puts a hunk added since grouping in Not yet grouped", () => {
    const grown = DIFF + fileDiff("src/sprocket.ts", ["six"]);
    const view = buildView(parseDiff(grown), stored(DIFF), null);
    expect(view.notYetGrouped!.files.map((f) => f.path)).toEqual(["src/sprocket.ts"]);
    expectEveryItemOnce(view, grown);
  });

  it("shows a hunk removed since grouping as removed, without counting it", () => {
    const shrunk = fileDiff("src/widget.ts", ["one", "two"]) + fileDiff("src/gadget.ts", ["four"]) + fileDiff("package-lock.json", ["five"]);
    const view = buildView(parseDiff(shrunk), stored(DIFF), null);
    const removed = view.concerns[0]!.files[0]!.hunks.filter((h) => h.status === "removed");
    expect(removed.map((h) => h.index)).toEqual([2]);
    expectEveryItemOnce(view, shrunk);
  });
});

describe("placeItems", () => {
  it("identical hunks in one file are placed once each", () => {
    const items = [
      { path: "a.ts", index: 0, kind: "hunk" as const, hash: "same" },
      { path: "a.ts", index: 1, kind: "hunk" as const, hash: "same" },
    ];
    const { placed, removed } = placeItems(items, [
      { path: "a.ts", index: 0, hash: "same", concern: 0 },
      { path: "a.ts", index: 1, hash: "same", concern: 1 },
    ]);
    expect([...placed.values()].map((p) => p.concern).sort()).toEqual([0, 1]);
    expect(removed).toEqual([]);
  });
});
