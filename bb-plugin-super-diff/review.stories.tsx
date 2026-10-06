import { experimental_Diff as Diff, experimental_SourceCode as SourceCode } from "@get-bb/plugin-sdk/app";
import { ReviewScreen } from "./components/review-screen";
import type { ReviewResult } from "./review/contract";
import { parseDiff } from "./review/items";
import { buildView } from "./review/view";
import { notCoveredFeature, scenarioFeature, type ResolvedStep } from "./review/tests/feature";
import type { Scenario } from "./review/grouping";

export default { title: "super-diff/Review panel" };

const DiffView = ({ patch, path }: { patch: string; path: string }) => <Diff patch={patch} path={path} />;
const SourceView = ({ content, path }: { content: string; path: string }) => <SourceCode content={content} path={path} overflow="wrap" />;

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
  { base: "origin/main" },
);

const render = (result: ReviewResult | null, generating = false, initialSection?: string) => (
  <div className="w-[560px]">
    <ReviewScreen
      result={result}
      error={null}
      generating={generating}
      onGenerate={() => {}}
      onSetViewed={() => {}}
      DiffView={DiffView}
      SourceView={SourceView}
      initialSection={initialSection}
    />
  </div>
);

/** Grouped and current: the first concern open, the lockfile set aside. */
export const Grouped = () => render({ state: "ok", view: grouped });

/** After a commit: the banner, with exactly what changed since the grouping. */
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
  render({ state: "unavailable", message: "Super Diff needs a git checkout, and this environment is not one." });

/** A branch with nothing on it yet. */
export const NoChanges = () => render({ state: "ok", view: buildView([], null, null) });

const STEPS: Record<string, ResolvedStep[]> = {
  "src/sprocket.test.ts:1.1": [{ id: "1.1", kind: "snapshot", code: "sprocket(4) toMatchSnapshot", value: "5" }],
  "src/sprocket.test.ts:1.2": [{ id: "1.2", kind: "exact", code: "sprocket(-1) toBe 0", value: null }],
};
const RECORDED = `{
  "gadget": 4,
  "result": 5,
  "rounding": "none",
  "sprocketVersion": 2,
}`;
STEPS["src/sprocket.test.ts:1.1"] = [{ id: "1.1", kind: "snapshot", code: "sprocket(4) toMatchSnapshot", value: RECORDED }];
STEPS["src/sprocket.test.ts:1.3"] = [{ id: "1.3", kind: "snapshot", code: "sprocket(Infinity) rejects toMatchSnapshot", value: "[Error: The gadget must be finite]" }];
const SCENARIOS: Scenario[] = [
  {
    title: "The sprocket adds one",
    given: ["a gadget worth 4"],
    when: ["the widget passes it through the sprocket"],
    then: [
      { text: "it comes out as 5", steps: ["src/sprocket.test.ts:1.1"] },
      { text: "a negative gadget comes out as 0", steps: ["src/sprocket.test.ts:1.2"] },
    ],
  },
  {
    title: "An endless gadget is refused",
    given: ["a gadget worth Infinity"],
    when: ["the widget passes it through the sprocket"],
    then: [{ text: "the call is refused", steps: ["src/sprocket.test.ts:1.3"] }],
  },
];
const scenarioViews = SCENARIOS.map((scenario) => {
  const folded = scenarioFeature(scenario, (ref) => STEPS[ref] ?? null, { values: false });
  const full = scenarioFeature(scenario, (ref) => STEPS[ref] ?? null, { values: true });
  return { title: scenario.title, asserted: folded.asserted, snapshotOnly: folded.snapshotOnly, steps: folded.text, values: full.text };
});
const notCovered = notCoveredFeature(
  [
    {
      title: "A gadget that is not a number",
      reason: "untested",
      note: "The sprocket never checks its input.",
      evidence: [{ path: "src/sprocket.ts", line: 1 }],
      given: ["a gadget worth \"four\""],
      when: ["the widget passes it through the sprocket"],
      then: ["the call is refused"],
    },
  ],
  undefined,
);

// The branch again with its tests: a test beside the sprocket, its snapshot,
// and a widget test that is a concern of its own.
const TESTS_DIFF = `${DIFF}diff --git a/src/sprocket.test.ts b/src/sprocket.test.ts
new file mode 100644
index 0000000..6666666
--- /dev/null
+++ b/src/sprocket.test.ts
@@ -0,0 +1,4 @@
+test("sprocket", () => {
+  expect(sprocket(4)).toMatchSnapshot();
+  expect(sprocket(-1)).toBe(0);
+});
diff --git a/src/__snapshots__/sprocket.test.ts.snap b/src/__snapshots__/sprocket.test.ts.snap
new file mode 100644
index 0000000..7777777
--- /dev/null
+++ b/src/__snapshots__/sprocket.test.ts.snap
@@ -0,0 +1 @@
+exports[\`sprocket 1\`] = \`5\`;
diff --git a/src/widget.test.ts b/src/widget.test.ts
index 8888888..9999999 100644
--- a/src/widget.test.ts
+++ b/src/widget.test.ts
@@ -1,3 +1,3 @@
 test("widget", () => {
-  expect(widget()).toBe(4);
+  expect(widget()).toBe(5);
 });
`;
const testFiles = parseDiff(TESTS_DIFF);
const hashOf = (path: string, index = 0) => testFiles.find((f) => f.path === path)!.hunks[index]!.hash;
const testConcerns: Array<{ title: string; note: string; items: Array<[string, number]>; tests: boolean }> = [
  {
    title: "Add the sprocket",
    note: "A one-line function that adds one, with the import that brings it into the widget, and a test for it.",
    items: [["src/sprocket.ts", 0], ["src/widget.ts", 0], ["src/sprocket.test.ts", 0], ["src/__snapshots__/sprocket.test.ts.snap", 0]],
    tests: true,
  },
  { title: "Call it from the widget", note: "The widget now returns its gadget through the sprocket.", items: [["src/widget.ts", 1]], tests: false },
  { title: "The widget test expects one more", note: "The widget's result goes up by the sprocket's one.", items: [["src/widget.test.ts", 0]], tests: true },
];
const withTestsBase = buildView(
  testFiles,
  {
    grouping: {
      headline: "Widgets pass their gadget through a new sprocket.",
      concerns: testConcerns.map((c) => ({ title: c.title, note: c.note, files: c.items.map(([path, i]) => ({ path, hunks: [i] })) })),
    },
    assignments: testConcerns.flatMap((c, concern) => c.items.map(([path, index]) => ({ path, index, hash: hashOf(path, index), concern }))),
    baseSha: "base",
    headSha: "head",
    groupedAt: "2026-10-05T12:00:00.000Z",
  },
  null,
  { base: "origin/main" },
);
const testsBlock = { scenarios: scenarioViews, notCovered, asserted: 1, snapshotOnly: 2, gaps: 1, snapshots: 2 };
const withTests = {
  ...withTestsBase,
  concerns: withTestsBase.concerns.map((c, i) => (testConcerns[i]!.tests ? { ...c, tests: testsBlock } : c)),
};

/** A concern that changes code and tests: the code first, then its tests as scenarios under Tests, whose Scenarios and Diff toggle swaps only the test files. The rail counts its scenarios. */
export const CodeAndTests = () => render({ state: "ok", view: withTests });

/** A concern that is only tests: its scenarios listed, the chosen one as Gherkin with recorded values folded until Show values, then what the tests leave out. Diff, beside the title, shows the raw files. The rail tags it "tests". */
export const TestConcern = () => render({ state: "ok", view: withTests }, false, "concern-2");

/** Some files marked viewed: they fold and dim, and the bar and the outline count them. */
export const SomeViewed = () =>
  render({
    state: "ok",
    view: {
      ...grouped,
      concerns: grouped.concerns.map((c, i) => (i === 1 ? { ...c, files: c.files.map((f) => ({ ...f, viewed: true })) } : c)),
      coverage: { ...grouped.coverage, viewed: 1 },
    },
  });
