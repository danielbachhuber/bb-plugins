import { describe, expect, it } from "vitest";
import { quoteSelection } from "./quote";

describe("quoteSelection", () => {
  it("quotes a phrase and leaves the cursor on a new paragraph", () => {
    expect(quoteSelection("return a collection")).toBe("> return a collection\n\n");
  });

  it("quotes every line of a multi-line selection", () => {
    expect(quoteSelection("const a = 1;\nconst b = 2;")).toBe(
      "> const a = 1;\n> const b = 2;\n\n",
    );
  });

  it("drops the indentation the selection happened to start at", () => {
    // Selecting nested code should not wrap the quote in dead space.
    expect(quoteSelection("      if (x) {\n        go();\n      }")).toBe(
      "> if (x) {\n>   go();\n> }\n\n",
    );
  });

  it("keeps relative indentation inside the selection", () => {
    expect(quoteSelection("a\n  b")).toBe("> a\n>   b\n\n");
  });

  it("leaves no trailing space on a blank quoted line", () => {
    expect(quoteSelection("a\n\nb")).toBe("> a\n>\n> b\n\n");
  });

  it("is empty for an empty or whitespace-only selection", () => {
    expect(quoteSelection("")).toBe("");
    expect(quoteSelection("   \n  ")).toBe("");
  });

  it("truncates a very long selection at a word boundary", () => {
    const long = "word ".repeat(400);
    const quoted = quoteSelection(long);
    expect(quoted.length).toBeLessThan(700);
    expect(quoted).toMatch(/…\n\n$/);
    expect(quoted).not.toMatch(/wor…/);
  });

  it("does not truncate a selection that fits", () => {
    expect(quoteSelection("short", 100)).toBe("> short\n\n");
  });
});
