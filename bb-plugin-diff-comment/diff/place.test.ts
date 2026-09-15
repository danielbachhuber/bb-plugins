import { describe, expect, it } from "vitest";
import { placeComments, placementKey, type Column } from "./place";
import type { Comment, CommentState, DiffLine, Side } from "@/comment/types";

function comment(
  id: string,
  line: number,
  text: string,
  side: Side = "new",
  state: CommentState = "open",
): Comment {
  return {
    id,
    threadId: "thr_1",
    path: "src/a.ts",
    side,
    line,
    anchor: { text, before: null, after: null },
    body: "note",
    state,
    reply: null,
    seq: 1,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

function column(name: string, lines: DiffLine[]): Column {
  return { element: { name } as unknown as Element, lines };
}

describe("placeComments", () => {
  it("places a comment on the line its anchor still matches", () => {
    const columns = [
      column("unified", [
        { side: "new", line: 1, text: "a" },
        { side: "new", line: 2, text: "b" },
      ]),
    ];
    const { placements, detached } = placeComments([comment("c1", 2, "b")], columns);
    expect(placements).toHaveLength(1);
    expect(placements[0]!.line).toBe(2);
    expect(detached).toEqual([]);
  });

  it("puts an old-side comment in the deletions column", () => {
    const deletions = column("old", [{ side: "old", line: 4, text: "gone();" }]);
    const additions = column("new", [{ side: "new", line: 4, text: "kept();" }]);
    const { placements } = placeComments([comment("c1", 4, "gone();", "old")], [
      deletions,
      additions,
    ]);
    expect(placements[0]!.column).toBe(deletions.element);
  });

  it("reports a comment whose code has gone as detached, not placed", () => {
    const columns = [column("unified", [{ side: "new", line: 1, text: "a" }])];
    const { placements, detached } = placeComments([comment("c1", 9, "vanished();")], columns);
    expect(placements).toEqual([]);
    expect(detached.map((c) => c.id)).toEqual(["c1"]);
  });

  it("leaves resolved comments off the diff entirely", () => {
    const columns = [column("unified", [{ side: "new", line: 1, text: "a" }])];
    const { placements, detached } = placeComments(
      [comment("c1", 1, "a", "new", "resolved")],
      columns,
    );
    expect(placements).toEqual([]);
    expect(detached).toEqual([]);
  });

  it("still places an addressed comment, so its reply is readable in place", () => {
    const columns = [column("unified", [{ side: "new", line: 1, text: "a" }])];
    const { placements } = placeComments([comment("c1", 1, "a", "new", "addressed")], columns);
    expect(placements).toHaveLength(1);
  });
});

describe("placementKey", () => {
  it("is stable regardless of comment order", () => {
    const columns = [
      column("unified", [
        { side: "new", line: 1, text: "a" },
        { side: "new", line: 2, text: "b" },
      ]),
    ];
    const a = placeComments([comment("c1", 1, "a"), comment("c2", 2, "b")], columns);
    const b = placeComments([comment("c2", 2, "b"), comment("c1", 1, "a")], columns);
    expect(placementKey(a.placements, columns)).toBe(placementKey(b.placements, columns));
  });

  it("changes when a comment moves to a different line", () => {
    const before = [column("unified", [{ side: "new", line: 2, text: "b" }])];
    const after = [column("unified", [{ side: "new", line: 7, text: "b" }])];
    const a = placeComments([comment("c1", 2, "b")], before);
    const b = placeComments([comment("c1", 2, "b")], after);
    expect(placementKey(a.placements, before)).not.toBe(placementKey(b.placements, after));
  });

  it("changes when a comment's state changes, so its card is redrawn", () => {
    const columns = [column("unified", [{ side: "new", line: 1, text: "a" }])];
    const open = placeComments([comment("c1", 1, "a")], columns);
    const addressed = placeComments([comment("c1", 1, "a", "new", "addressed")], columns);
    expect(placementKey(open.placements, columns)).not.toBe(
      placementKey(addressed.placements, columns),
    );
  });
});

describe("placementKey and edits", () => {
  it("changes when a comment's body is edited", () => {
    // An edit moves neither the line nor the state, so without `updatedAt` in
    // the key the card would keep showing the text you just replaced.
    const columns = [column("unified", [{ side: "new", line: 1, text: "a" }])];
    const before = comment("c1", 1, "a");
    const after = { ...before, body: "rewritten", updatedAt: "2026-09-14T01:00:00.000Z" };

    const a = placeComments([before], columns);
    const b = placeComments([after], columns);
    expect(placementKey(a.placements, columns)).not.toBe(placementKey(b.placements, columns));
  });
});
