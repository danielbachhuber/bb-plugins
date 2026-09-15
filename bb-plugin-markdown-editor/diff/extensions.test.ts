import { describe, expect, it } from "vitest";
import { extensionOf, isEditablePath } from "./extensions";

describe("extensionOf", () => {
  it("reads the extension of a nested path", () => {
    expect(extensionOf("docs/architecture/notes.md")).toBe("md");
  });

  it("lowercases it, because a diff can hold README.MD", () => {
    expect(extensionOf("README.MD")).toBe("md");
  });

  it("ignores a dot in a directory name", () => {
    expect(extensionOf("some.dir/Makefile")).toBe(null);
  });

  it("treats a dotfile as a whole filename, not an extension", () => {
    expect(extensionOf(".gitignore")).toBe(null);
    expect(extensionOf("config/.npmrc")).toBe(null);
  });
});

describe("isEditablePath", () => {
  it("claims every extension the fileOpener claims", () => {
    expect(isEditablePath("a.md")).toBe(true);
    expect(isEditablePath("a.mdx")).toBe(true);
    expect(isEditablePath("a.markdown")).toBe(true);
    expect(isEditablePath("a.txt")).toBe(true);
  });

  it("claims nothing else", () => {
    expect(isEditablePath("app.tsx")).toBe(false);
    expect(isEditablePath("notes.md.bak")).toBe(false);
    expect(isEditablePath("LICENSE")).toBe(false);
  });
});
