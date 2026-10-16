import { describe, expect, it } from "vitest";
import { itemsOf, parseDiff } from "./items";

const TWO_HUNKS = `diff --git a/src/widget.ts b/src/widget.ts
index 1111111..2222222 100644
--- a/src/widget.ts
+++ b/src/widget.ts
@@ -1,3 +1,4 @@
 import { gadget } from "./gadget";
+import { sprocket } from "./sprocket";

 export function widget() {
@@ -10,2 +11,2 @@ export function widget() {
-  return gadget();
+  return sprocket(gadget());
 }
`;

const ADDED = `diff --git a/src/sprocket.ts b/src/sprocket.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/sprocket.ts
@@ -0,0 +1,2 @@
+export const sprocket = (x: number) => x + 1;
+// end
\\ No newline at end of file
`;

const DELETED = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const old = 1;
`;

const PURE_RENAME = `diff --git a/docs/a.md b/docs/b.md
similarity index 100%
rename from docs/a.md
rename to docs/b.md
`;

const BINARY = `diff --git a/assets/logo.png b/assets/logo.png
index 5555555..6666666 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

const SPACES = `diff --git a/docs/read me.md b/docs/read me.md
index 7777777..8888888 100644
--- a/docs/read me.md\t
+++ b/docs/read me.md\t
@@ -1 +1 @@
-old
+new
`;

describe("parseDiff", () => {
  it("splits a file into numbered hunks", () => {
    const [file] = parseDiff(TWO_HUNKS);
    expect(file!.path).toBe("src/widget.ts");
    expect(file!.status).toBe("modified");
    expect(file!.hunks.map((h) => h.index)).toEqual([0, 1]);
    expect(file!.hunks[1]!.header).toBe("@@ -10,2 +11,2 @@ export function widget() {");
    expect(file!.header).toContain("+++ b/src/widget.ts");
  });

  it("hashes a hunk by its body, so a line shift keeps the hash", () => {
    const shifted = TWO_HUNKS.replace("@@ -10,2 +11,2 @@", "@@ -20,2 +21,2 @@");
    expect(parseDiff(shifted)[0]!.hunks[1]!.hash).toBe(parseDiff(TWO_HUNKS)[0]!.hunks[1]!.hash);
  });

  it("reads added, deleted, renamed, and binary files", () => {
    const files = parseDiff(ADDED + DELETED + PURE_RENAME + BINARY);
    expect(files.map((f) => [f.path, f.status, f.binary, f.hunks.length])).toEqual([
      ["src/sprocket.ts", "added", false, 1],
      ["src/old.ts", "deleted", false, 1],
      ["docs/b.md", "renamed", false, 0],
      ["assets/logo.png", "modified", true, 0],
    ]);
    expect(files[2]!.previousPath).toBe("docs/a.md");
    expect(files[0]!.hunks[0]!.text).toContain("\\ No newline at end of file");
  });

  it("parses a path with spaces", () => {
    expect(parseDiff(SPACES)[0]!.path).toBe("docs/read me.md");
  });

  it("parses quoted paths with a quote, a tab, and an octal escape", () => {
    const quoted = `diff --git "a/we\\"ird.ts" "b/we\\"ird.ts"
index 1111111..2222222 100644
--- "a/we\\"ird.ts"
+++ "b/we\\"ird.ts"
@@ -1 +1 @@
-a
+b
diff --git "a/tab\\tname.ts" "b/tab\\tname.ts"
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ "b/tab\\tname.ts"
@@ -0,0 +1 @@
+x
diff --git "a/bell\\007.bin" "b/bell\\007.bin"
index 4444444..5555555 100644
Binary files "a/bell\\007.bin" and "b/bell\\007.bin" differ
`;
    expect(parseDiff(quoted).map((f) => f.path)).toEqual(['we"ird.ts', "tab\tname.ts", "bell\u0007.bin"]);
  });

  it("merges two sections for the same path into one file", () => {
    const twice = `diff --git a/f.txt b/f.txt
deleted file mode 100644
index 1111111..0000000
--- a/f.txt
+++ /dev/null
@@ -1 +0,0 @@
-hello
diff --git a/f.txt b/f.txt
new file mode 120000
index 0000000..2222222
--- /dev/null
+++ b/f.txt
@@ -0,0 +1 @@
+target
`;
    const files = parseDiff(twice);
    expect(files.map((f) => [f.path, f.status, f.hunks.map((h) => h.index)])).toEqual([["f.txt", "modified", [0, 1]]]);
    expect(itemsOf(files).map((i) => `${i.path}#${i.index}`)).toEqual(["f.txt#0", "f.txt#1"]);
  });

  it("returns nothing for an empty diff", () => {
    expect(parseDiff("")).toEqual([]);
  });
});

describe("itemsOf", () => {
  it("gives one item per hunk and one per file without hunks", () => {
    const items = itemsOf(parseDiff(TWO_HUNKS + PURE_RENAME + BINARY));
    expect(items.map((i) => [i.path, i.index, i.kind])).toEqual([
      ["src/widget.ts", 0, "hunk"],
      ["src/widget.ts", 1, "hunk"],
      ["docs/b.md", 0, "file"],
      ["assets/logo.png", 0, "file"],
    ]);
  });
});
