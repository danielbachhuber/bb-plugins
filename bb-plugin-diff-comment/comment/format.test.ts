import { describe, expect, it } from "vitest";
import { formatDetail, formatRow, parseRef } from "./format";
import type { Comment } from "./types";

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "a1b2c3d4",
    threadId: "thr_1",
    path: "src/widget.ts",
    side: "new",
    line: 9,
    anchor: { text: "const a = 1;", before: "const x = 1;", after: "const b = 2;" },
    body: "This name does not say what it holds.",
    state: "open",
    reply: null,
    seq: 1,
    createdAt: "2026-09-14T10:00:00.000Z",
    updatedAt: "2026-09-14T10:00:00.000Z",
    ...overrides,
  };
}

describe("formatRow", () => {
  it("leads with the reference the agent passes back", () => {
    expect(formatRow(comment())).toMatch(/^#1\b/);
  });

  it("names the state, the file, and the line", () => {
    const row = formatRow(comment());
    expect(row).toContain("open");
    expect(row).toContain("src/widget.ts:9");
  });

  it("marks the old side, and leaves the new side unmarked", () => {
    expect(formatRow(comment({ side: "old" }))).toContain("(old)");
    expect(formatRow(comment({ side: "new" }))).not.toContain("(new)");
  });

  it("shows one line of the body, however many it has", () => {
    const row = formatRow(comment({ body: "first line\n\nsecond paragraph" }));
    expect(row).toContain("first line");
    expect(row).not.toContain("second paragraph");
  });

  it("says when a comment is detached rather than dropping it", () => {
    expect(formatRow(comment(), { detached: true })).toContain("detached");
  });
});

describe("formatDetail", () => {
  it("quotes the commented line with its neighbours, marking the line itself", () => {
    const detail = formatDetail(comment());
    expect(detail).toContain("   8 |   const x = 1;");
    expect(detail).toContain("   9 | > const a = 1;");
    expect(detail).toContain("  10 |   const b = 2;");
  });

  it("omits neighbours the comment never had", () => {
    const detail = formatDetail(comment({ anchor: { text: "only();", before: null, after: null } }));
    expect(detail).toContain("   9 | > only();");
    expect(detail.split("\n").filter((l) => l.includes("|")).length).toBe(1);
  });

  it("includes the whole body", () => {
    const detail = formatDetail(comment({ body: "first line\n\nsecond paragraph" }));
    expect(detail).toContain("first line");
    expect(detail).toContain("second paragraph");
  });

  it("shows the agent's own reply once there is one", () => {
    const detail = formatDetail(comment({ state: "addressed", reply: "Renamed to activeCount." }));
    expect(detail).toContain("Renamed to activeCount.");
  });

  it("says nothing about a reply when there is none", () => {
    expect(formatDetail(comment())).not.toMatch(/repl/i);
  });
});

describe("parseRef", () => {
  it("accepts a seq with a hash", () => {
    expect(parseRef("#2")).toEqual({ kind: "seq", seq: 2 });
  });

  it("accepts a bare number as a seq", () => {
    expect(parseRef("2")).toEqual({ kind: "seq", seq: 2 });
  });

  it("accepts an id", () => {
    expect(parseRef("a1b2c3d4")).toEqual({ kind: "id", id: "a1b2c3d4" });
  });

  it("rejects an empty reference", () => {
    expect(parseRef("")).toBeNull();
  });

  it("rejects a zero or negative seq, which no comment has", () => {
    expect(parseRef("#0")).toBeNull();
    expect(parseRef("-3")).toBeNull();
  });
});
