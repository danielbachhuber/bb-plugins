import { describe, expect, it } from "vitest";
import { resolveGrouping } from "./check";
import { isMechanical } from "./classify";
import type { ReviewView } from "./contract";
import { shownKeys } from "./coverage";
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

function expectEveryItemOnce(view: ReviewView, diff: string) {
  const expected = itemsOf(parseDiff(diff)).map((i) => `${i.path}#${i.index}`).sort();
  expect(shownKeys(view).sort()).toEqual(expected);
  expect(view.coverage).toEqual({ files: parseDiff(diff).length, hunks: expected.length, shown: expected.length, viewed: 0 });
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

  describe("viewed marks", () => {
    const files = parseDiff(DIFF);
    const hash = (path: string, index: number) => files.find((f) => f.path === path)!.hunks[index]!.hash;
    const cards = (view: ReviewView) => view.concerns.map((c) => c.files.map((f) => [f.path, f.viewed]));

    it("marks a split file viewed only in the concern whose hunks were viewed", () => {
      // src/widget.ts is split: hunks 0 and 2 in Sprocket, hunk 1 in Call site.
      const view = buildView(files, stored(DIFF), null, { viewed: new Map([["src/widget.ts#0", hash("src/widget.ts", 0)], ["src/widget.ts#2", hash("src/widget.ts", 2)]]) });
      expect(cards(view)).toEqual([[["src/widget.ts", true]], [["src/widget.ts", false], ["src/gadget.ts", false]]]);
      expect(view.coverage.viewed).toBe(2);
    });

    it("shows a split file viewed in every concern once all its hunks are", () => {
      const all = new Map([0, 1, 2].map((i) => [`src/widget.ts#${i}`, hash("src/widget.ts", i)]));
      const view = buildView(files, stored(DIFF), null, { viewed: all });
      expect(cards(view)).toEqual([[["src/widget.ts", true]], [["src/widget.ts", true], ["src/gadget.ts", false]]]);
      expect(view.coverage.viewed).toBe(3);
    });

    it("reads every hunk of a file GitHub shows Viewed, while its counts match the pull request's", () => {
      const gh = (path: string, viewed: boolean, additions = 3) => [path, { path, additions, deletions: 3, viewed }] as const;
      const view = buildView(files, stored(DIFF), null, {
        github: { where: "github", files: new Map([gh("src/widget.ts", true), gh("src/gadget.ts", true, 9)]) },
      });
      const all = view.concerns.flatMap((c) => c.files);
      const widget = all.filter((f) => f.path === "src/widget.ts");
      expect(widget.map((f) => [f.sync, f.githubViewed, f.viewed])).toEqual([
        ["synced", true, true],
        ["synced", true, true],
      ]);
      expect(widget.flatMap((f) => f.hunks.map((h) => h.read))).toEqual([true, true, true]);
      // gadget.ts differs from the pull request, so GitHub's Viewed does not count.
      expect(all.find((f) => f.path === "src/gadget.ts")).toMatchObject({ sync: "local", githubViewed: false, viewed: false });
      expect(view.coverage.viewed).toBe(3);
    });

    it("marks every file unsynced without a pull request", () => {
      const view = buildView(files, stored(DIFF), null);
      expect(new Set(view.concerns.flatMap((c) => c.files.map((f) => f.sync)))).toEqual(new Set(["none"]));
    });

    it("lists every file's hunks for the bar, with their size, read state, and section", () => {
      const view = buildView(files, stored(DIFF), null, { viewed: new Map([["src/widget.ts#1", hash("src/widget.ts", 1)]]) });
      expect(view.files).toEqual([
        {
          path: "src/widget.ts",
          hunks: [
            { index: 0, lines: 2, read: false, section: "concern-0" },
            { index: 1, lines: 2, read: true, section: "concern-1" },
            { index: 2, lines: 2, read: false, section: "concern-0" },
          ],
        },
        { path: "src/gadget.ts", hunks: [{ index: 0, lines: 2, read: false, section: "concern-1" }] },
        { path: "package-lock.json", hunks: [{ index: 0, lines: 2, read: false, section: "mechanical" }] },
      ]);
    });

    it("drops a hunk's mark when its lines change", () => {
      const view = buildView(files, stored(DIFF), null, { viewed: new Map([["src/gadget.ts#0", "old-hash"]]) });
      expect(view.concerns[1]!.files.find((f) => f.path === "src/gadget.ts")!.viewed).toBe(false);
    });
  });

  it("attaches a test overlay to its concern", () => {
    const tests = {
      scenarios: [{ title: "x", tests: [], asserted: 0, snapshotOnly: 1, steps: "Scenario: x", values: "Scenario: x" }],
      notCovered: "Feature: Not covered by these tests",
      asserted: 0,
      snapshotOnly: 1,
      gaps: 0,
      snapshots: 1,
    };
    const view = buildView(parseDiff(DIFF), stored(DIFF), null, { tests: new Map([[1, tests]]) });
    expect(view.concerns[0]!.tests).toBeNull();
    expect(view.concerns[1]!.tests).toEqual(tests);
  });
});
