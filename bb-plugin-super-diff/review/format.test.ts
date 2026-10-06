import { describe, expect, it } from "vitest";
import { formatHunkList } from "./format";
import { parseDiff } from "./items";

const DIFF = `diff --git a/src/widget.ts b/src/widget.ts
index 1111111..2222222 100644
--- a/src/widget.ts
+++ b/src/widget.ts
@@ -1,1 +1,1 @@ one
-a
+b
@@ -9,1 +9,1 @@ two
-c
+d
diff --git a/yarn.lock b/yarn.lock
index 3333333..4444444 100644
--- a/yarn.lock
+++ b/yarn.lock
@@ -1 +1 @@
-x
+y
diff --git a/assets/logo.png b/assets/logo.png
index 5555555..6666666 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
`;

describe("formatHunkList", () => {
  it("lists files with numbered hunks and marks mechanical and whole-file items", () => {
    expect(formatHunkList(parseDiff(DIFF), { full: false })).toBe(
      [
        "3 files, 4 items. Hunks are numbered from 0.",
        "",
        "M  src/widget.ts  (2 hunks)",
        "     0: @@ -1,1 +1,1 @@ one",
        "     1: @@ -9,1 +9,1 @@ two",
        "M  yarn.lock  (1 hunk, mechanical)",
        "     0: @@ -1 +1 @@",
        "M  assets/logo.png  (binary, whole file)",
      ].join("\n"),
    );
  });

  it("prints each hunk's lines under a path#index marker when full", () => {
    const text = formatHunkList(parseDiff(DIFF), { full: true });
    expect(text).toContain("### src/widget.ts#1\n@@ -9,1 +9,1 @@ two\n-c\n+d");
  });
});
