import { describe, expect, it } from "vitest";
import {
  anchorFromHunk,
  drawable,
  githubPath,
  toThread,
  type RawThread,
} from "./threads";

const HUNK = [
  "@@ -10,6 +10,8 @@ export function widget() {",
  "   const a = 1;",
  "-  const b = 2;",
  "+  const b = 3;",
  "+  const c = 4;",
].join("\n");

function raw(overrides: Partial<RawThread> = {}): RawThread {
  return {
    id: "PRRT_1",
    isResolved: false,
    isOutdated: false,
    path: "src/widget.ts",
    line: 12,
    originalLine: 12,
    diffSide: "RIGHT",
    subjectType: "LINE",
    comments: {
      nodes: [
        {
          id: "PRRC_1",
          url: "https://github.com/acme/widgets/pull/7#discussion_r1",
          body: "Why four?",
          createdAt: "2026-09-14T00:00:00Z",
          state: "SUBMITTED",
          author: { login: "octocat" },
          diffHunk: HUNK,
        },
      ],
    },
    ...overrides,
  };
}

describe("anchorFromHunk", () => {
  it("takes the last line as the anchor, and the line above on the same side", () => {
    expect(anchorFromHunk(HUNK, "new")).toEqual({
      text: "  const c = 4;",
      before: "  const b = 3;",
      after: null,
    });
  });

  it("skips the other side's lines when finding the line above", () => {
    const hunk = ["@@ -1,3 +1,3 @@", " const a = 1;", "-const b = 2;", "+const b = 3;"].join("\n");
    expect(anchorFromHunk(hunk, "new")).toEqual({
      text: "const b = 3;",
      before: "const a = 1;",
      after: null,
    });
  });

  it("reads a deletion for the old side", () => {
    const hunk = ["@@ -1,2 +1,1 @@", " const a = 1;", "-const b = 2;"].join("\n");
    expect(anchorFromHunk(hunk, "old")?.text).toBe("const b = 2;");
  });

  it("ignores a no-newline marker and a trailing newline", () => {
    const hunk = `${HUNK}\n\\ No newline at end of file\n`;
    expect(anchorFromHunk(hunk, "new")?.text).toBe("  const c = 4;");
  });

  it("returns null when the hunk ends on the other side", () => {
    expect(anchorFromHunk(HUNK, "old")).toBeNull();
  });
});

describe("toThread", () => {
  it("maps the payload, anchoring on the first comment's hunk", () => {
    const thread = toThread(raw());
    expect(thread.side).toBe("new");
    expect(thread.line).toBe(12);
    expect(thread.anchor?.text).toBe("  const c = 4;");
    expect(thread.comments[0]).toMatchObject({ author: "octocat", pending: false });
  });

  it("marks a draft comment pending", () => {
    const base = raw();
    const thread = toThread({
      ...base,
      comments: { nodes: [{ ...base.comments.nodes[0]!, state: "PENDING" }] },
    });
    expect(thread.comments[0]!.pending).toBe(true);
  });

  it("falls back to the original line when GitHub no longer places it", () => {
    expect(toThread(raw({ line: null, originalLine: 9, isOutdated: true })).line).toBe(9);
  });

  it("gives a comment on the whole file no line", () => {
    const thread = toThread(raw({ subjectType: "FILE", line: null, originalLine: null }));
    expect(thread.line).toBeNull();
    expect(thread.anchor).toBeNull();
  });

  it("reads LEFT as the old side", () => {
    const hunk = ["@@ -1,2 +1,1 @@", " const a = 1;", "-const b = 2;"].join("\n");
    const base = raw({ diffSide: "LEFT" });
    const thread = toThread({
      ...base,
      comments: { nodes: [{ ...base.comments.nodes[0]!, diffHunk: hunk }] },
    });
    expect(thread.side).toBe("old");
    expect(thread.anchor?.text).toBe("const b = 2;");
  });

  it("keeps a deleted account's comment, with no author", () => {
    const base = raw();
    const thread = toThread({
      ...base,
      comments: { nodes: [{ ...base.comments.nodes[0]!, author: null }] },
    });
    expect(thread.comments[0]!.author).toBeNull();
  });
});

describe("drawable", () => {
  it("draws an open thread on a line", () => {
    expect(drawable(toThread(raw()))).toBe(true);
  });

  it("leaves resolved, outdated, and file-level threads off the diff", () => {
    expect(drawable(toThread(raw({ isResolved: true })))).toBe(false);
    expect(drawable(toThread(raw({ isOutdated: true, line: null })))).toBe(false);
    expect(drawable(toThread(raw({ subjectType: "FILE", line: null })))).toBe(false);
  });
});

describe("githubPath", () => {
  it("uses the current path of a rename", () => {
    expect(githubPath("src/old.ts -> src/new.ts")).toBe("src/new.ts");
    expect(githubPath("src/a.ts")).toBe("src/a.ts");
  });
});
