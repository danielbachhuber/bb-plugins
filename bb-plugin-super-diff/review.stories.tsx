import { experimental_Diff as Diff, experimental_SourceCode as SourceCode } from "@get-bb/plugin-sdk/app";
import { ReviewScreen } from "./components/review-screen";
import type { ReviewResult } from "./review/contract";
import { parseDiff } from "./review/items";
import { buildView, type StoredGrouping } from "./review/view";
import { notCoveredFeature, scenarioFeature, type ResolvedStep } from "./review/tests/feature";
import type { Scenario } from "./review/grouping";

export default { title: "super-diff/Review panel" };

const DiffView = ({ patch, path, wrap }: { patch: string; path: string; wrap: boolean }) => <Diff patch={patch} path={path} overflow={wrap ? "wrap" : "scroll"} />;
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
const STORED: StoredGrouping = {
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
};
const AGREE = { status: "agree" as const, onlyBb: [], onlyHere: [], reason: null };
const grouped = buildView(files, STORED, null, { base: "origin/main", crossCheck: AGREE });
/** The grouped branch with some hunks marked viewed at their current lines. */
const viewedAt = (...keys: Array<[string, number]>) =>
  buildView(files, STORED, null, {
    base: "origin/main",
    crossCheck: AGREE,
    viewed: new Map(keys.map(([path, index]) => [`${path}#${index}`, files.find((f) => f.path === path)!.hunks[index]!.hash])),
  });

const render = (result: ReviewResult | null, generating = false, initialSection?: string) => (
  <div className="w-[560px]">
    <ReviewScreen
      result={result}
      error={null}
      generating={generating}
      onGenerate={() => {}}
      onSetRead={() => {}}
      onSetFileViewed={() => {}}
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
STEPS["src/sprocket.test.ts:2.1"] = [{ id: "2.1", kind: "snapshot", code: "sprocket(Infinity) rejects toMatchSnapshot", value: "[Error: The gadget must be finite]" }];
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
    then: [{ text: "the call is refused", steps: ["src/sprocket.test.ts:2.1"] }],
  },
];
const scenarioViews = SCENARIOS.map((scenario) => {
  const folded = scenarioFeature(scenario, (ref) => STEPS[ref] ?? null, { values: false });
  const full = scenarioFeature(scenario, (ref) => STEPS[ref] ?? null, { values: true });
  return { title: scenario.title, asserted: folded.asserted, snapshotOnly: folded.snapshotOnly, steps: folded.text, values: full.text };
});
// Each scenario is one whole test() call: test 1 has two steps, test 2 one.
const SPROCKET_TESTS = [
  { name: "sprocket adds one", total: 2 },
  { name: "sprocket refuses Infinity", total: 1 },
];
const matchedViews = scenarioViews.map((view, i) => ({
  ...view,
  tests: [{ path: "src/sprocket.test.ts", test: i + 1, name: SPROCKET_TESTS[i]!.name, cited: SPROCKET_TESTS[i]!.total, total: SPROCKET_TESTS[i]!.total, sharedWith: 0 }],
}));
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
@@ -0,0 +1,3 @@
+exports[\`sprocket adds one 1\`] = \`5\`;
+
+exports[\`sprocket refuses Infinity 1\`] = \`"The gadget must be finite"\`;
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
const testsBlock = { scenarios: matchedViews, notCovered, asserted: 1, snapshotOnly: 2, gaps: 1, snapshots: 2 };
const withTests = {
  ...withTestsBase,
  concerns: withTestsBase.concerns.map((c, i) => (testConcerns[i]!.tests ? { ...c, tests: testsBlock } : c)),
};

/** A concern that changes code and tests: the code first, then its tests as scenarios under Tests, whose Scenarios and Diff toggle swaps only the test files. The rail counts its scenarios. */
export const CodeAndTests = () => render({ state: "ok", view: withTests });

/** A concern that is only tests: its scenarios listed, the chosen one as Gherkin with recorded values folded until Show values, then what the tests leave out. Diff, beside the title, shows the raw files. The rail tags it "tests". */
export const TestConcern = () => render({ state: "ok", view: withTests }, false, "concern-2");

/** Some files marked viewed: they fold and dim, and the bar and the rail count them. */
export const SomeViewed = () => render({ state: "ok", view: viewedAt(["src/sprocket.ts", 0]) });

/** A file split across concerns, viewed in one: src/widget.ts folds in Add the sprocket, which holds its first hunk, but stays open in Call it from the widget, and the bar does not count it until both are read. */
export const SplitFileViewedInOneConcern = () => render({ state: "ok", view: viewedAt(["src/widget.ts", 0]) });

// One widget test() that checks three things, described as three scenarios.
const WIDGET_STEPS: Record<string, ResolvedStep[]> = {
  "src/widget.test.ts:1.1": [{ id: "1.1", kind: "exact", code: "widget() toBe 5", value: null }],
  "src/widget.test.ts:1.2": [{ id: "1.2", kind: "exact", code: "widget(0) toBe 1", value: null }],
  "src/widget.test.ts:1.3": [{ id: "1.3", kind: "error", code: "widget(-1) toThrow", value: null }],
};
const SPLIT: Scenario[] = [
  { title: "A widget passes its gadget through the sprocket", given: ["a gadget worth 4"], when: ["the widget runs"], then: [{ text: "it returns 5", steps: ["src/widget.test.ts:1.1"] }] },
  { title: "An empty gadget still gets one", given: ["a gadget worth 0"], when: ["the widget runs"], then: [{ text: "it returns 1", steps: ["src/widget.test.ts:1.2"] }] },
  { title: "A negative gadget is refused", given: ["a gadget worth -1"], when: ["the widget runs"], then: [{ text: "it throws", steps: ["src/widget.test.ts:1.3"] }] },
];
const splitViews = SPLIT.map((scenario) => {
  const folded = scenarioFeature(scenario, (ref) => WIDGET_STEPS[ref] ?? null, { values: false });
  return {
    title: scenario.title,
    tests: [{ path: "src/widget.test.ts", test: 1, name: "widget", cited: 1, total: 3, sharedWith: 2 }],
    asserted: folded.asserted,
    snapshotOnly: folded.snapshotOnly,
    steps: folded.text,
    values: folded.text,
  };
});

/** Scenarios that do not match the test() calls: three scenarios written from one test. A note above the list says so, and each scenario says how much of the test it covers. */
export const ScenariosSplitOneTest = () =>
  render(
    {
      state: "ok",
      view: {
        ...withTests,
        concerns: withTests.concerns.map((c, i) =>
          i === 2 ? { ...c, tests: { scenarios: splitViews, notCovered, asserted: 3, snapshotOnly: 0, gaps: 1, snapshots: 0 } } : c,
        ),
      },
    },
    false,
    "concern-2",
  );

// A made-up branch of 42 files across five directories, to show the bar past 30 files.
const MANY_DIFF = Array.from({ length: 42 }, (_, i) => {
  const dir = ["src/api/", "src/widgets/", "src/gadgets/", "test/", "docs/"][i % 5]!;
  const path = `${dir}part-${String(i).padStart(2, "0")}.ts`;
  const hunks = Array.from({ length: 1 + (i % 3) }, (_, h) => {
    const lines = Array.from({ length: 1 + ((i * 7 + h * 3) % 9) }, (_, l) => `+line ${l}`).join("\n");
    return `@@ -${h * 20 + 1},1 +${h * 20 + 1},${2 + ((i * 7 + h * 3) % 9)} @@\n context\n${lines}\n`;
  }).join("");
  return `diff --git a/${path} b/${path}\nindex 1111111..2222222 100644\n--- a/${path}\n+++ b/${path}\n${hunks}`;
}).join("");
const manyFiles = parseDiff(MANY_DIFF);
const manyRead = new Map(manyFiles.slice(0, 36).flatMap((f) => f.hunks.map((h) => [`${f.path}#${h.index}`, h.hash] as [string, string])));

/** A branch of 42 files, most of them read: too many to name one by one, so the bar groups them by directory, each named with its file count, every file still a sliver that fills as it is read. */
export const ManyFiles = () =>
  render({ state: "ok", view: buildView(manyFiles, null, null, { base: "origin/main", crossCheck: AGREE, viewed: manyRead }) });

/** bb's own changes panel lists a file Super Diff does not: the check beside the count turns red and names it. */
export const FilesDifferFromBb = () =>
  render({ state: "ok", view: { ...grouped, crossCheck: { status: "differ", onlyBb: ["docs/sprocket.md"], onlyHere: [], reason: null } } });

// The pull request's files, for the sync stories: widget.ts and sprocket.ts as
// this branch has them, so they sync; the lockfile is not on it.
const pullRequest = (widgetViewed: boolean, widgetAdditions = 2) =>
  new Map([
    ["src/widget.ts", { path: "src/widget.ts", additions: widgetAdditions, deletions: 1, viewed: widgetViewed }],
    ["src/sprocket.ts", { path: "src/sprocket.ts", additions: 1, deletions: 0, viewed: false }],
  ]);
// One concern holding both of widget.ts's hunks, so a card shows a read strip beside an unread one.
const ONE_CONCERN: StoredGrouping = {
  ...STORED,
  grouping: {
    headline: STORED.grouping.headline,
    concerns: [{ title: "Add the sprocket and call it", note: "A one-line function that adds one, and the widget passing its gadget through it.", files: ["src/widget.ts", "src/sprocket.ts"] }],
  },
  assignments: STORED.assignments.map((a) => ({ ...a, concern: 0 })),
};
const synced = (opts: { viewed?: Array<[string, number]>; widgetViewed?: boolean; widgetAdditions?: number; pullRequest?: boolean }) =>
  buildView(files, ONE_CONCERN, null, {
    base: "origin/main",
    crossCheck: AGREE,
    github: opts.pullRequest === false ? null : pullRequest(opts.widgetViewed ?? false, opts.widgetAdditions),
    viewed: new Map((opts.viewed ?? []).map(([path, index]) => [`${path}#${index}`, files.find((f) => f.path === path)!.hunks[index]!.hash])),
  });

/** No pull request: each hunk has a checkmark on its strip, and a read hunk folds to it. Files have no Viewed box. */
export const ChecksWithoutPullRequest = () => render({ state: "ok", view: synced({ pullRequest: false, viewed: [["src/widget.ts", 0]] }) });

/** A pull request with the same files: each file's Viewed box is GitHub's. widget.ts has its first hunk read and its second still to read, so it is not yet Viewed. */
export const SyncedOneHunkRead = () => render({ state: "ok", view: synced({ viewed: [["src/widget.ts", 0]] }) });

/** widget.ts is Viewed on GitHub, so every hunk of it reads as checked and its card folds. */
export const SyncedViewedOnGithub = () => render({ state: "ok", view: synced({ widgetViewed: true }) });

/** widget.ts has edits not on the pull request, so it shows "not on GitHub yet" instead of Viewed; its checkmarks stay in bb. */
export const NotOnGithubYet = () => render({ state: "ok", view: synced({ widgetAdditions: 5, viewed: [["src/widget.ts", 0]] }) });

