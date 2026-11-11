import { describe, expect, it } from "vitest";
import { packageNote } from "./changes-block.js";
import { changeFormat, fillNote, parseView, readView } from "./schema.js";
import {
  expandPatchFiles,
  compareVersions,
  diffWords,
  textPatch,
  lockfileKind,
  lockfilePackages,
  manifestFor,
  pairLines,
  patchCounts,
  proseCounts,
  splitPatch,
} from "./changes.js";

describe("pairLines", () => {
  const before = [
    "- Led the refactor onto a typed contract, about 90 pull requests.",
    "- Opened 498 pull requests and reviewed 745 in six months.",
    "- Ran discovery calls with 15 organizations.",
  ].join("\n");
  const after = [
    "- Managed three engineers through two review cycles.",
    "- Led the refactor onto a typed contract, about 90 pull requests, for six partners.",
    "- Ran discovery calls with 15 organizations.",
  ].join("\n");

  it("puts a rewritten line beside what it was, and a new line and a dropped one where they fall", () => {
    expect(pairLines(before, after)).toEqual([
      { kind: "added", text: "- Managed three engineers through two review cycles." },
      {
        kind: "changed",
        text: "- Led the refactor onto a typed contract, about 90 pull requests, for six partners.",
        from: "- Led the refactor onto a typed contract, about 90 pull requests.",
      },
      { kind: "removed", text: "- Opened 498 pull requests and reviewed 745 in six months." },
      { kind: "same", text: "- Ran discovery calls with 15 organizations." },
    ]);
  });

  it("counts a rewritten line as one added and one removed", () => {
    expect(proseCounts(pairLines(before, after))).toEqual({ added: 2, removed: 2 });
    expect(proseCounts(pairLines(before, before))).toEqual({ added: 0, removed: 0 });
  });

  it("pairs a line that grew around what it was, and a rewritten paragraph that kept most of its words", () => {
    const rows = pairLines(
      "acme/widgets is downloaded 90,000 times a week. It is a dependency of 1,400 public projects, and its release queue is behind.\n\n- 212 open issues\n- Downloads grew 40% this year",
      "Two volunteers maintain acme/widgets in their evenings. It is a dependency of 1,400 public projects, and its release queue is four months behind.\n\n- 212 open issues, 38 of them security reports waiting on triage\n- No maintainer is paid for the work",
    );
    expect(rows.map((row) => row.kind)).toEqual(["changed", "same", "changed", "removed", "added"]);
  });

  it("pairs a line that moved without changing", () => {
    const rows = pairLines("one line here\nanother line there", "another line there\none line here");
    expect(rows.map((row) => row.kind)).toEqual(["same", "same"]);
  });
});

const PACKAGE_JSON = `diff --git a/package.json b/package.json
index 1111111..2222222 100644
--- a/package.json
+++ b/package.json
@@ -14,7 +14,7 @@
   "dependencies": {
     "clsx": "^2.1.1",
-    "date-fns": "^4.1.0",
+    "date-fns": "^4.2.0",
     "zod": "^3.25.76"
`;

const PACKAGE_LOCK = `diff --git a/package-lock.json b/package-lock.json
index 3333333..4444444 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -9,7 +9,7 @@
       "dependencies": {
-        "date-fns": "^4.1.0",
+        "date-fns": "^4.2.0",
         "zod": "^3.25.76"
@@ -2104,9 +2104,9 @@
     "node_modules/date-fns": {
-      "version": "4.1.0",
-      "resolved": "https://registry.npmjs.org/date-fns/-/date-fns-4.1.0.tgz",
+      "version": "4.2.0",
+      "resolved": "https://registry.npmjs.org/date-fns/-/date-fns-4.2.0.tgz",
       "license": "MIT",
@@ -3001,6 +3001,11 @@
+    "node_modules/@date-fns/tz": {
+      "version": "1.2.0",
+      "resolved": "https://registry.npmjs.org/@date-fns/tz/-/tz-1.2.0.tgz",
+      "license": "MIT"
+    },
@@ -5871,9 +5876,9 @@
     "node_modules/zod": {
-      "version": "3.25.76",
+      "version": "3.24.2",
       "license": "MIT",
@@ -6010,7 +6015,7 @@
     "node_modules/widgets-core/node_modules/semver": {
-      "version": "7.6.0",
+      "version": "7.6.3",
       "license": "ISC",
`;

describe("splitPatch", () => {
  it("splits a multi-file diff into one patch per file", () => {
    const files = splitPatch(PACKAGE_JSON + PACKAGE_LOCK);
    expect(files.map((file) => file.path)).toEqual(["package.json", "package-lock.json"]);
    expect(files[0]!.patch).toBe(PACKAGE_JSON);
    expect(files[1]!.patch.startsWith("diff --git a/package-lock.json")).toBe(true);
  });

  it("names a deleted file by its old path, and a bare hunk by its +++ line", () => {
    const deleted = "diff --git a/old.ts b/old.ts\ndeleted file mode 100644\n--- a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n";
    expect(splitPatch(deleted)[0]!.path).toBe("old.ts");
    expect(splitPatch("--- a/src/sync.ts\n+++ b/src/sync.ts\n@@ -1 +1 @@\n-a\n+b\n")[0]!.path).toBe("src/sync.ts");
    expect(splitPatch("")).toEqual([]);
  });

  it("counts added and removed lines without the file headers", () => {
    expect(patchCounts(PACKAGE_JSON)).toEqual({ added: 1, removed: 1 });
  });
});

describe("lockfilePackages", () => {
  it("knows lockfiles by name, and finds the manifest beside one", () => {
    expect(lockfileKind("web/pnpm-lock.yaml")).toBe("pnpm-lock.yaml");
    expect(lockfileKind("package.json")).toBeNull();
    expect(manifestFor("web/package-lock.json")).toBe("web/package.json");
    expect(manifestFor("yarn.lock")).toBe("package.json");
  });

  it("compares versions part by part", () => {
    expect(compareVersions("3.25.76", "3.24.2")).toBeGreaterThan(0);
    expect(compareVersions("4.1.0", "4.10.0")).toBeLessThan(0);
    expect(compareVersions("v1.2.0", "1.2.0")).toBe(0);
  });

  it("reads package-lock.json: the bump first, then a downgrade the manifest does not explain, then the rest", () => {
    expect(lockfilePackages("package-lock.json", PACKAGE_LOCK, PACKAGE_JSON)).toEqual([
      { name: "date-fns", from: "4.1.0", to: "4.2.0", kind: "upgrade", inManifest: true },
      { name: "zod", from: "3.25.76", to: "3.24.2", kind: "downgrade", inManifest: false },
      { name: "@date-fns/tz", to: "1.2.0", kind: "added", inManifest: false },
      { name: "semver", from: "7.6.0", to: "7.6.3", kind: "upgrade", inManifest: false },
    ]);
  });

  it("puts downgrades first, and does not say whether the manifest names a package, when there is no manifest diff", () => {
    const packages = lockfilePackages("package-lock.json", PACKAGE_LOCK);
    expect(packages[0]).toMatchObject({ name: "zod", kind: "downgrade", inManifest: null });
    expect(packages.every((change) => change.inManifest === null)).toBe(true);
  });

  it("reads pnpm-lock.yaml, counting a package listed under packages and snapshots once", () => {
    const pnpm = `--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -20,8 +20,8 @@ importers:
       date-fns:
-        specifier: ^4.1.0
-        version: 4.1.0
+        specifier: ^4.2.0
+        version: 4.2.0
@@ -300,8 +300,8 @@ packages:
-  date-fns@4.1.0:
-    resolution: {integrity: sha512-aaa}
+  date-fns@4.2.0:
+    resolution: {integrity: sha512-bbb}
-  '@scope/widget@2.0.0':
+  '@scope/widget@1.9.0':
@@ -900,4 +900,4 @@ snapshots:
-  date-fns@4.1.0: {}
+  date-fns@4.2.0: {}
`;
    expect(lockfilePackages("pnpm-lock.yaml", pnpm)).toEqual([
      { name: "@scope/widget", from: "2.0.0", to: "1.9.0", kind: "downgrade", inManifest: null },
      { name: "date-fns", from: "4.1.0", to: "4.2.0", kind: "upgrade", inManifest: null },
    ]);
  });

  it("reads yarn.lock, classic and berry", () => {
    const classic = `--- a/yarn.lock
+++ b/yarn.lock
@@ -40,7 +40,7 @@
-date-fns@^4.1.0:
-  version "4.1.0"
+date-fns@^4.2.0:
+  version "4.2.0"
   resolved "https://registry.yarnpkg.com/date-fns/-/date-fns-4.2.0.tgz"
`;
    const berry = `--- a/yarn.lock
+++ b/yarn.lock
@@ -40,7 +40,7 @@
 "date-fns@npm:^4.1.0":
-  version: 4.1.0
+  version: 4.2.0
   resolution: "date-fns@npm:4.2.0"
`;
    const expected = [{ name: "date-fns", from: "4.1.0", to: "4.2.0", kind: "upgrade", inManifest: null }];
    expect(lockfilePackages("yarn.lock", classic)).toEqual(expected);
    expect(lockfilePackages("yarn.lock", berry)).toEqual(expected);
  });
});

describe("item changes", () => {
  const view = (item: object) => JSON.stringify({ title: "T", sections: [{ items: [{ id: "a", title: "A", ...item }] }] });

  it("draws a patch as code and text as prose, unless the change says", () => {
    const [code, prose, forced] = parseView(
      view({
        changes: [
          { label: "src/sync.ts", patch: "@@ -1 +1 @@\n-a\n+b\n" },
          { label: "Need", before: "old", after: "new" },
          { label: "notes.md", before: "old", after: "new", format: "code" },
        ],
      }),
    ).sections[0]!.items[0]!.changes;
    expect([code, prose, forced].map((change) => changeFormat(change!))).toEqual(["code", "prose", "code"]);
    expect(code!.collapsed).toBe(false);
  });

  it("names what is wrong with a change", () => {
    expect(() => parseView(view({ changes: [{ label: "x" }] }))).toThrow(/changes\.0: a change needs exactly one of/);
    expect(() => parseView(view({ changes: [{ label: "x", patch: "p", before: "b" }] }))).toThrow(/exactly one of/);
    expect(() => parseView(view({ changes: [{ patch: "p" }] }))).toThrow(/changes\.0\.label/);
    expect(() => parseView(view({ changes: [{ label: "x", patch: "p", format: "prose" }] }))).toThrow(/a patch is code/);
    expect(() => parseView(view({ changes: [{ label: "Need", before: "b" }] }))).toThrow(/has no markdown draft/);
    expect(() =>
      parseView(view({ draft: "d", changes: [{ label: "One", before: "b" }, { label: "Two", before: "c" }] })),
    ).toThrow(/only one change can compare against the draft/);
    expect(parseView(view({ draft: "new", changes: [{ label: "Need", before: "old" }] })).sections[0]!.items[0]!.changes).toHaveLength(1);
  });

  it("keeps a proposed patchFile's role on each file it splits into", async () => {
    const parsed = parseView(view({ changes: [{ patchFile: "/tmp/fix.diff", role: "proposed" }] }));
    expect(parseView(view({ changes: [{ label: "a", before: "x", after: "y" }] })).sections[0]!.items[0]!.changes[0]!.role).toBe("current");
    const changes = (await expandPatchFiles(parsed, async () => PACKAGE_JSON + PACKAGE_LOCK)).sections[0]!.items[0]!.changes;
    expect(changes.map((change) => change.role)).toEqual(["proposed", "proposed"]);
  });

  it("reads a patchFile into one change per file at publish, keeping the others as they were", async () => {
    const parsed = parseView(
      view({ changes: [{ label: "README.md", before: "a", after: "b" }, { patchFile: "/tmp/pr-418.diff", collapsed: true }] }),
    );
    const read = async (path: string) => {
      expect(path).toBe("/tmp/pr-418.diff");
      return PACKAGE_JSON + PACKAGE_LOCK;
    };
    const changes = (await expandPatchFiles(parsed, read)).sections[0]!.items[0]!.changes;
    expect(changes.map((change) => [change.label, change.patchFile, change.collapsed])).toEqual([
      ["README.md", undefined, false],
      ["package.json", undefined, true],
      ["package-lock.json", undefined, true],
    ]);
    expect(changes[1]!.patch).toBe(PACKAGE_JSON);
  });

  describe("a suggested change with only yes or no", () => {
    const apply = { type: "message", label: "Apply", primary: true, text: "Apply a" };
    const skip = { type: "message", label: "Skip", text: "Skip a" };
    const fix = { changes: [{ label: "README.md", before: "x", after: "y" }], actions: [apply, skip] };

    it("gets a Revise field and button that sends the note", () => {
      const { view: parsed, warnings } = readView(view(fix));
      const item = parsed.sections[0]!.items[0]!;
      expect(item.note).toEqual({ label: "Revise", placeholder: "What to change instead" });
      expect(item.actions.map((action) => action.label)).toEqual(["Apply", "Skip", "Revise"]);
      expect(fillNote(item.actions[2]!, "Shorter")).toMatchObject({ text: 'Revise a ("A"): Shorter', repeat: true });
      expect(warnings).toEqual([expect.stringMatching(/^a: added a Revise field/)]);
    });

    it("sends the draft too when the change compares against it", () => {
      const item = parseView(view({ draft: "new", changes: [{ label: "Need", before: "old" }], actions: [apply] })).sections[0]!.items[0]!;
      expect(item.actions[1]).toMatchObject({ text: 'Revise a ("A"): {note}\n\nThe text as I left it:\n\n{draft}' });
    });

    it("does the same for a proposed patch", () => {
      const item = parseView(view({ changes: [{ label: "a.ts", patch: "@@ -1 +1 @@\n-a\n+b\n", role: "proposed" }], actions: [apply] })).sections[0]!.items[0]!;
      expect(item.note).toBeDefined();
    });

    it("leaves alone a card with its own note, a pull request's own diff, a list row, or a card with no buttons", () => {
      const own = { note: {}, actions: [apply, { type: "message", label: "Redo", text: "Redo: {note}" }] };
      expect(readView(view({ ...fix, ...own }))).toMatchObject({ warnings: [] });
      expect(parseView(view({ ...fix, ...own })).sections[0]!.items[0]!.actions).toHaveLength(2);
      expect(parseView(view({ changes: [{ label: "a.ts", patch: "@@ -1 +1 @@\n-a\n+b\n" }], actions: [apply] })).sections[0]!.items[0]!.note).toBeUndefined();
      expect(parseView(view({ changes: fix.changes })).sections[0]!.items[0]!.note).toBeUndefined();
      const list = JSON.stringify({ title: "T", layout: "list", sections: [{ items: [{ id: "a", title: "A", ...fix }] }] });
      expect(parseView(list).sections[0]!.items[0]!.note).toBeUndefined();
    });
  });

  it("fails the publish on a missing or empty diff, naming the item", async () => {
    const parsed = parseView(view({ changes: [{ patchFile: "/tmp/none.diff" }] }));
    await expect(expandPatchFiles(parsed, async () => { throw new Error("ENOENT"); })).rejects.toThrow("a: no diff at /tmp/none.diff.");
    await expect(expandPatchFiles(parsed, async () => "")).rejects.toThrow("a: /tmp/none.diff has no diff in it.");
  });
});

describe("diffWords", () => {
  it("marks the words that changed and keeps the spaces between them", () => {
    expect(diffWords("used by the six national partners.", "used by six national broadcasters.")).toEqual([
      { kind: "same", text: "used by " },
      { kind: "removed", text: "the " },
      { kind: "same", text: "six national " },
      { kind: "removed", text: "partners" },
      { kind: "added", text: "broadcasters" },
      { kind: "same", text: "." },
    ]);
    expect(diffWords("- 212 open issues", "- 212 open issues, 38 of them waiting")).toEqual([
      { kind: "same", text: "- 212 open issues" },
      { kind: "added", text: ", 38 of them waiting" },
    ]);
  });

  it("reads a rewritten phrase as the old phrase, then the new one", () => {
    expect(
      diffWords(
        "acme/widgets is downloaded 90,000 times a week. It is a dependency.",
        "Two volunteers maintain acme/widgets in their evenings. It is a dependency.",
      ),
    ).toEqual([
      { kind: "removed", text: "acme/widgets is downloaded 90,000 times a week" },
      { kind: "added", text: "Two volunteers maintain acme/widgets in their evenings" },
      { kind: "same", text: ". It is a dependency." },
    ]);
  });

  it("writes a whole-file patch for a code change given as two texts", () => {
    expect(textPatch("notes.md", "a\nb\nc\n", "a\nB\nc\n")).toBe(
      "--- a/notes.md\n+++ b/notes.md\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n",
    );
    expect(patchCounts(textPatch("x", "", "one\ntwo"))).toEqual({ added: 2, removed: 0 });
  });
});

describe("package rows", () => {
  it("says what a package row's change is, and warns on a downgrade", () => {
    const [bump, zod, tz] = lockfilePackages("package-lock.json", PACKAGE_LOCK, PACKAGE_JSON);
    expect(packageNote(bump!, "package.json")).toEqual({ text: "In package.json", warn: false });
    expect(packageNote(zod!, "package.json")).toEqual({ text: "Downgrade, not in package.json", warn: true });
    expect(packageNote(tz!, "package.json")).toEqual({ text: "Added, not in package.json", warn: false });
    expect(packageNote({ ...bump!, inManifest: null }, "package.json")).toEqual({ text: "", warn: false });
  });
});
