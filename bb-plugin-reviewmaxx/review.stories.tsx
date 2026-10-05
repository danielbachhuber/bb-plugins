import { ReviewScreen } from "./components/review-screen";
import type { ReviewResult } from "./review/contract";
import { parseDiff } from "./review/items";
import { buildView } from "./review/view";

export default { title: "reviewmaxx/Review panel" };

// Stories have no bb runtime, so the diff is drawn as plain text.
const DiffView = ({ patch }: { patch: string; path: string }) => (
  <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{patch}</pre>
);

const DIFF = `diff --git a/src/widget.ts b/src/widget.ts
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
diff --git a/src/sprocket.ts b/src/sprocket.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/sprocket.ts
@@ -0,0 +1 @@
+export const sprocket = (x: number) => x + 1;
diff --git a/package-lock.json b/package-lock.json
index 4444444..5555555 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -1 +1 @@
-  "version": "1.0.0"
+  "version": "1.1.0"
`;

const files = parseDiff(DIFF);
const grouped = buildView(
  files,
  {
    grouping: {
      headline: "Widgets pass their gadget through a new sprocket.",
      concerns: [
        {
          title: "Add the sprocket",
          note: "A one-line function that adds one, with the import that brings it into the widget.",
          files: ["src/sprocket.ts", { path: "src/widget.ts", hunks: [0] }],
        },
        { title: "Call it from the widget", note: "The widget now returns its gadget through the sprocket.", files: [{ path: "src/widget.ts", hunks: [1] }] },
      ],
    },
    assignments: [
      { path: "src/widget.ts", index: 0, hash: files[0]!.hunks[0]!.hash, concern: 0 },
      { path: "src/widget.ts", index: 1, hash: files[0]!.hunks[1]!.hash, concern: 1 },
      { path: "src/sprocket.ts", index: 0, hash: files[1]!.hunks[0]!.hash, concern: 0 },
    ],
    baseSha: "base",
    headSha: "head",
    groupedAt: "2026-10-05T12:00:00.000Z",
  },
  null,
);

const render = (result: ReviewResult | null, generating = false) => (
  <div className="w-[560px]">
    <ReviewScreen result={result} error={null} generating={generating} onGenerate={() => {}} DiffView={DiffView} />
  </div>
);

/** Grouped and current: the first concern open, the lockfile set aside. */
export const Grouped = () => render({ state: "ok", view: grouped });

/** After a commit: the banner, what changed since, and a hunk marked changed. */
export const Stale = () =>
  render({
    state: "ok",
    view: {
      ...grouped,
      stale: {
        groupedAt: "2026-10-05T12:00:00.000Z",
        groupedHead: "a1b2c3d4e5",
        commitsSince: 1,
        changedFiles: [
          {
            path: "src/sprocket.ts",
            patch: "@@ -1 +1 @@\n-export const sprocket = (x: number) => x + 1;\n+export const sprocket = (x: number) => x + 2;\n",
          },
        ],
      },
    },
  });

/** Before any grouping: everything under Not yet grouped, with Generate. */
export const NotGroupedYet = () => render({ state: "ok", view: buildView(files, null, null) });

/** After Generate, while the agent works. */
export const Generating = () => render({ state: "ok", view: buildView(files, null, null) }, true);

/** An environment without a git checkout. */
export const Unavailable = () =>
  render({ state: "unavailable", message: "Reviewmaxx needs a git checkout, and this environment is not one." });

/** A branch with nothing on it yet. */
export const NoChanges = () => render({ state: "ok", view: buildView([], null, null) });
