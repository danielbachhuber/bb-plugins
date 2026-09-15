import { describe, expect, it } from "vitest";
import { locate } from "./anchor";
import type { AnchorContext, Comment, DiffLine } from "./types";

function line(side: "old" | "new", n: number, text: string): DiffLine {
  return { side, line: n, text };
}

function commentAt(n: number, anchor: AnchorContext, side: "old" | "new" = "new"): Comment {
  return {
    id: "c1",
    threadId: "thr_1",
    path: "src/widget.ts",
    side,
    line: n,
    anchor,
    body: "why is this here?",
    state: "open",
    reply: null,
    seq: 1,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
  };
}

describe("locate", () => {
  it("finds the line it was placed on when nothing moved", () => {
    const lines = [
      line("new", 1, "const a = 1;"),
      line("new", 2, "const b = 2;"),
      line("new", 3, "const c = 3;"),
    ];
    const comment = commentAt(2, { text: "const b = 2;", before: "const a = 1;", after: "const c = 3;" });
    expect(locate(comment, lines)).toBe(2);
  });

  it("follows its line when the file shifts down", () => {
    const lines = [
      line("new", 1, "import x from 'x';"),
      line("new", 2, ""),
      line("new", 3, "const a = 1;"),
      line("new", 4, "const b = 2;"),
      line("new", 5, "const c = 3;"),
    ];
    const comment = commentAt(2, { text: "const b = 2;", before: "const a = 1;", after: "const c = 3;" });
    expect(locate(comment, lines)).toBe(4);
  });

  it("stays on its own side", () => {
    const lines = [
      line("old", 7, "const b = 2;"),
      line("new", 9, "const b = 2;"),
    ];
    const comment = commentAt(9, { text: "const b = 2;", before: null, after: null }, "new");
    expect(locate(comment, lines)).toBe(9);
  });

  it("uses the surrounding lines to choose between identical candidates", () => {
    // `}` on its own appears three times. Only one has `return a;` above it.
    const lines = [
      line("new", 1, "function a() {"),
      line("new", 2, "  return a;"),
      line("new", 3, "}"),
      line("new", 4, "function b() {"),
      line("new", 5, "  return b;"),
      line("new", 6, "}"),
      line("new", 7, "function c() {"),
      line("new", 8, "  return c;"),
      line("new", 9, "}"),
    ];
    const comment = commentAt(30, { text: "}", before: "  return b;", after: "function c() {" });
    expect(locate(comment, lines)).toBe(6);
  });

  it("prefers the nearest candidate when context cannot separate them", () => {
    const lines = [
      line("new", 2, "}"),
      line("new", 40, "}"),
      line("new", 80, "}"),
    ];
    const comment = commentAt(38, { text: "}", before: null, after: null });
    expect(locate(comment, lines)).toBe(40);
  });

  it("ignores indentation changes", () => {
    const lines = [line("new", 5, "      const b = 2;")];
    const comment = commentAt(5, { text: "  const b = 2;", before: null, after: null });
    expect(locate(comment, lines)).toBe(5);
  });

  it("detaches when the line is gone", () => {
    const lines = [line("new", 1, "const a = 1;"), line("new", 2, "const c = 3;")];
    const comment = commentAt(2, { text: "const b = 2;", before: "const a = 1;", after: "const c = 3;" });
    expect(locate(comment, lines)).toBeNull();
  });

  it("detaches against an empty diff rather than guessing", () => {
    const comment = commentAt(2, { text: "const b = 2;", before: null, after: null });
    expect(locate(comment, [])).toBeNull();
  });

  it("does not match a blank line to just any blank line", () => {
    const lines = [line("new", 1, "const a = 1;"), line("new", 2, "   "), line("new", 3, "const c = 3;")];
    // A comment whose anchor text is whitespace carries no signal of its own,
    // so context has to carry it.
    const comment = commentAt(2, { text: "", before: "const a = 1;", after: "const c = 3;" });
    expect(locate(comment, lines)).toBe(2);
  });
});
