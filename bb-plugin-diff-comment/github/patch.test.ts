import { describe, expect, it } from "vitest";
import { exchangeBody, patchLines, reviewTarget, type PullFile } from "./patch";

const PATCH = [
  "@@ -10,4 +10,5 @@ export function widget() {",
  "   const a = 1;",
  "-  const b = 2;",
  "+  const b = 3;",
  "+  const c = 4;",
  "   return a + b;",
  "\\ No newline at end of file",
].join("\n");

const FILES: PullFile[] = [{ path: "src/widget.ts", patch: PATCH }];

describe("patchLines", () => {
  it("numbers each side from the hunk header, with context on both", () => {
    expect(patchLines(PATCH)).toEqual([
      { side: "old", line: 10, text: "  const a = 1;" },
      { side: "old", line: 11, text: "  const b = 2;" },
      { side: "old", line: 12, text: "  return a + b;" },
      { side: "new", line: 10, text: "  const a = 1;" },
      { side: "new", line: 11, text: "  const b = 3;" },
      { side: "new", line: 12, text: "  const c = 4;" },
      { side: "new", line: 13, text: "  return a + b;" },
    ]);
  });

  it("restarts numbering at each hunk", () => {
    const patch = ["@@ -1,1 +1,1 @@", "-a", "+b", "@@ -40,1 +40,1 @@", " z"].join("\n");
    expect(patchLines(patch).filter((line) => line.side === "new").map((line) => line.line)).toEqual([
      1, 40,
    ]);
  });
});

describe("reviewTarget", () => {
  const anchor = (text: string, before: string | null = null) => ({ text, before, after: null });

  it("gives GitHub's line number, not bb's, when unpushed edits moved it", () => {
    const target = reviewTarget(FILES, "src/widget.ts", {
      side: "new",
      line: 30,
      anchor: anchor("  const c = 4;", "  const b = 3;"),
    });
    expect(target).toEqual({ ok: true, line: 12 });
  });

  it("finds a deletion on the old side", () => {
    expect(
      reviewTarget(FILES, "src/widget.ts", { side: "old", line: 11, anchor: anchor("  const b = 2;") }),
    ).toEqual({ ok: true, line: 11 });
  });

  it("refuses a line that is not in the pull request's diff", () => {
    const target = reviewTarget(FILES, "src/widget.ts", {
      side: "new",
      line: 11,
      anchor: anchor("  const b = 5;"),
    });
    expect(target.ok).toBe(false);
  });

  it("refuses a file the pull request does not touch", () => {
    const target = reviewTarget(FILES, "src/gadget.ts", { side: "new", line: 1, anchor: anchor("x") });
    expect(target).toMatchObject({ ok: false, reason: expect.stringContaining("isn't in the pull request") });
  });

  it("refuses a file GitHub sends no patch for", () => {
    const target = reviewTarget([{ path: "logo.png", patch: null }], "logo.png", {
      side: "new",
      line: 1,
      anchor: anchor("x"),
    });
    expect(target.ok).toBe(false);
  });

  it("matches a renamed file by its current path", () => {
    expect(
      reviewTarget(FILES, "src/old.ts -> src/widget.ts", {
        side: "new",
        line: 12,
        anchor: anchor("  const c = 4;"),
      }),
    ).toEqual({ ok: true, line: 12 });
  });
});

describe("exchangeBody", () => {
  it("credits the answer to the thread's provider", () => {
    expect(exchangeBody("Why four?\n", " Because the gadget needs it. ", "claude-code")).toBe(
      "Why four?\n\n**Answer** (from Claude Code):\n\nBecause the gadget needs it.",
    );
  });

  it("falls back to 'the agent' for a provider it does not know", () => {
    expect(exchangeBody("Q", "A", "acp-custom")).toContain("(from the agent)");
    expect(exchangeBody("Q", "A", null)).toContain("(from the agent)");
  });
});
