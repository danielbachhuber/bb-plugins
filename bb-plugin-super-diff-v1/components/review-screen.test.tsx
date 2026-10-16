// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewView, ViewTests } from "@/review/contract";
import { parseDiff } from "@/review/items";
import { buildView } from "@/review/view";
import { ReviewScreen, type ReviewScreenProps } from "./review-screen";

// bb's icons need the bb runtime, which jsdom does not have.
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));

afterEach(cleanup);

const SourceView = ({ content, path }: { content: string; path: string }) => (
  <pre data-testid="source" data-path={path}>
    {content}
  </pre>
);

function screenWith(props: Partial<ReviewScreenProps> & Pick<ReviewScreenProps, "result">) {
  return render(
    <ReviewScreen
      error={null}
      generating={false}
      onGenerate={() => {}}
      onSetRead={() => {}}
      onSetFileViewed={() => {}}
      DiffView={DiffView}
      SourceView={SourceView}
      {...props}
    />,
  );
}

const DiffView = ({ patch, path, file, wrap }: { patch: string; path: string; file?: { hash: string; hunk: string }; wrap: boolean }) => (
  <pre data-testid="diff" data-path={path} data-file-hash={file?.hash} data-hunk-text={file?.hunk} data-wrap={String(wrap)}>
    {patch}
  </pre>
);

const DIFF = `diff --git a/src/widget.ts b/src/widget.ts
index 1111111..2222222 100644
--- a/src/widget.ts
+++ b/src/widget.ts
@@ -1 +1 @@
-a
+b
@@ -9 +9 @@
-c
+d
diff --git a/assets/logo.png b/assets/logo.png
index 3333333..4444444 100644
Binary files a/assets/logo.png and b/assets/logo.png differ
diff --git a/yarn.lock b/yarn.lock
index 5555555..6666666 100644
--- a/yarn.lock
+++ b/yarn.lock
@@ -1 +1 @@
-x
+y
`;

function view(): ReviewView {
  const files = parseDiff(DIFF);
  return buildView(
    files,
    {
      grouping: {
        headline: "The widget changes twice.",
        concerns: [
          { title: "First", note: "The first change.", files: [{ path: "src/widget.ts", hunks: [0] }, "assets/logo.png"] },
          { title: "Second", note: "The second change.", files: [{ path: "src/widget.ts", hunks: [1] }] },
        ],
      },
      assignments: [
        { path: "src/widget.ts", index: 0, hash: files[0]!.hunks[0]!.hash, concern: 0 },
        { path: "assets/logo.png", index: 0, hash: files[1]!.hash, concern: 0 },
        { path: "src/widget.ts", index: 1, hash: files[0]!.hunks[1]!.hash, concern: 1 },
      ],
      baseSha: "base",
      headSha: "head",
      groupedAt: "2026-10-05T12:00:00.000Z",
    },
    null,
  );
}

const SHAPES_DIFF = `diff --git a/src/widget.ts b/src/widget.ts
index 1111111..2222222 100644
--- a/src/widget.ts
+++ b/src/widget.ts
@@ -1 +1 @@
-a
+b
@@ -9 +9 @@
-c
+d
diff --git a/src/widget.test.ts b/src/widget.test.ts
index 1111111..2222222 100644
--- a/src/widget.test.ts
+++ b/src/widget.test.ts
@@ -1 +1 @@
-e
+f
diff --git a/src/__snapshots__/widget.test.ts.snap b/src/__snapshots__/widget.test.ts.snap
index 1111111..2222222 100644
--- a/src/__snapshots__/widget.test.ts.snap
+++ b/src/__snapshots__/widget.test.ts.snap
@@ -1 +1 @@
-g
+h
diff --git a/src/gadget.test.ts b/src/gadget.test.ts
index 1111111..2222222 100644
--- a/src/gadget.test.ts
+++ b/src/gadget.test.ts
@@ -1 +1 @@
-i
+j
diff --git a/src/gadget.ts b/src/gadget.ts
index 1111111..2222222 100644
--- a/src/gadget.ts
+++ b/src/gadget.ts
@@ -1 +1 @@
-k
+l
`;

const TESTS: ViewTests = {
  scenarios: [
    { title: "It works", tests: [{ path: "src/widget.test.ts", test: 1, name: "works", cited: 2, total: 2, sharedWith: 0, line: 1, endLine: 1 }], asserted: 1, snapshotOnly: 1, steps: "Scenario: It works\n  # 1.1 x toMatchSnapshot  (recorded: 3 lines)", values: 'Scenario: It works\n  """\n  {}\n  """', hunks: [] },
    { title: "It refuses", tests: [{ path: "src/widget.test.ts", test: 2, name: "refuses", cited: 1, total: 1, sharedWith: 0, line: 1, endLine: 1 }], asserted: 0, snapshotOnly: 1, steps: "Scenario: It refuses", values: "Scenario: It refuses", hunks: [] },
  ],
  notCovered: "Feature: Not covered by these tests\n\n  @untested",
  asserted: 1,
  snapshotOnly: 2,
  gaps: 1,
  snapshots: 2,
  outside: [],
};

/**
 * One concern of each shape: code only, code and tests, tests only, and
 * scenarios over a concern that holds no test files.
 */
function shapes(): ReviewView {
  const files = parseDiff(SHAPES_DIFF);
  const hash = (path: string, index: number) => files.find((f) => f.path === path)!.hunks[index]!.hash;
  const concerns: Array<[string, Array<[string, number]>]> = [
    ["Code only", [["src/widget.ts", 0]]],
    ["Code and tests", [["src/widget.ts", 1], ["src/widget.test.ts", 0], ["src/__snapshots__/widget.test.ts.snap", 0]]],
    ["Tests only", [["src/gadget.test.ts", 0]]],
    ["Scenarios, no test files", [["src/gadget.ts", 0]]],
  ];
  const v = buildView(
    files,
    {
      grouping: {
        headline: "One concern of each shape.",
        concerns: concerns.map(([title, items]) => ({ title, note: "", files: items.map(([path, i]) => ({ path, hunks: [i] })) })),
      },
      assignments: concerns.flatMap(([, items], concern) => items.map(([path, index]) => ({ path, index, hash: hash(path, index), concern }))),
      baseSha: "base",
      headSha: "head",
      groupedAt: "2026-10-05T12:00:00.000Z",
    },
    null,
  );
  return { ...v, concerns: v.concerns.map((c, i) => (i === 0 ? c : { ...c, tests: TESTS })) };
}

/** Every item rendered once, collected by choosing each entry in the rail in turn. */
function allRenderedKeys(container: HTMLElement): string[] {
  const keys: string[] = [];
  for (const item of Array.from(container.querySelectorAll<HTMLButtonElement>("[data-rail-item]"))) {
    fireEvent.click(item);
    const diff = container.querySelector<HTMLButtonElement>('[data-mode="diff"]');
    if (diff) fireEvent.click(diff);
    for (const el of Array.from(container.querySelectorAll("[data-file][data-hunk]"))) {
      if (el.getAttribute("data-status") !== "removed") keys.push(`${el.getAttribute("data-file")}#${el.getAttribute("data-hunk")}`);
    }
  }
  return keys.sort();
}

describe("ReviewScreen", () => {
  it("renders every item exactly once across the concerns in the rail", () => {
    const { container } = screenWith({ result: { state: "ok", view: view() } });
    expect(allRenderedKeys(container)).toEqual(["assets/logo.png#0", "src/widget.ts#0", "src/widget.ts#1", "yarn.lock#0"]);
    expect(container.querySelector("[data-super-diff]")).toHaveAttribute("data-super-diff", "ready");
    expect(screen.getByText("The widget changes twice.")).toBeInTheDocument();
    expect(screen.getByText("3 files, 4 hunks, all shown")).toBeInTheDocument();
  });

  it("lists the concerns in a rail and starts on the first", () => {
    const v = view();
    v.concerns[0]!.files[1]!.viewed = true;
    v.coverage.viewed = 1;
    screenWith({ result: { state: "ok", view: v } });
    const rail = screen.getByRole("navigation", { name: "Concerns" });
    const items = within(rail).getAllByRole("button");
    expect(items.map((b) => b.textContent)).toEqual([expect.stringContaining("First"), expect.stringContaining("Second"), expect.stringContaining("Mechanical")]);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    expect(within(rail).getByText("1/2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "First" })).toBeInTheDocument();
    expect(screen.getByText("1 of 4 hunks viewed")).toBeInTheDocument();
  });

  it("fills each concern's ring with its hunks read, and shows a done concern as reviewed", () => {
    const v = view();
    // First holds two hunks; read one. Second holds one; read it.
    v.concerns[0]!.files[0]!.hunks = v.concerns[0]!.files[0]!.hunks.map((h) => ({ ...h, read: true }));
    v.concerns[1]!.files = v.concerns[1]!.files.map((f) => ({ ...f, viewed: true, hunks: f.hunks.map((h) => ({ ...h, read: true })) }));
    const { container } = screenWith({ result: { state: "ok", view: v } });
    const rings = Array.from(container.querySelectorAll("[data-rail-item]")).map((item) => item.querySelector("[data-rail-progress]")!.getAttribute("data-rail-progress"));
    expect(rings).toEqual(["1/2", "done", "0/1"]);
    const second = container.querySelector('[data-rail-item="concern-1"]')!;
    expect(second).toHaveTextContent("Reviewed");
  });

  it("moves to the next concern from the bottom of the page", () => {
    screenWith({ result: { state: "ok", view: view() } });
    fireEvent.click(screen.getByRole("button", { name: /^Next: Second/ }));
    expect(screen.getByRole("heading", { level: 3, name: "Second" })).toBeInTheDocument();
    expect(screen.getByText("hunk 2 of 2")).toBeInTheDocument();
  });

  describe("reading hunks", () => {
    /** The first concern, with its widget.ts hunk read or not, and its files' sync state. */
    function withRead(read: boolean, sync: "synced" | "local" | "none" = "none", githubViewed = false) {
      const v = view();
      const files = v.concerns[0]!.files.map((f) => ({ ...f, sync, githubViewed }));
      files[0] = { ...files[0]!, viewed: read, hunks: files[0]!.hunks.map((h) => ({ ...h, read })) };
      v.concerns[0] = { ...v.concerns[0]!, files };
      return v;
    }
    const strip = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-file="src/widget.ts"][data-hunk="0"]')!;

    it("gives each hunk a strip with its checkmark, and reports a check for that hunk alone", () => {
      const onSetRead = vi.fn();
      const { container } = screenWith({ result: { state: "ok", view: withRead(false) }, onSetRead });
      expect(within(strip(container)).getByText("Hunk 1 of 2")).toBeInTheDocument();
      expect(screen.getAllByTestId("diff").length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole("button", { name: "Mark read: src/widget.ts, hunk 1 of 2" }));
      // Only this hunk: hunk 2 of the same file belongs to Second.
      expect(onSetRead).toHaveBeenCalledWith("src/widget.ts", [0], true);
    });

    it("wraps long lines by default, and Unwrap scrolls them sideways in every diff", () => {
      screenWith({ result: { state: "ok", view: withRead(false) } });
      const wraps = () => screen.getAllByTestId("diff").map((d) => d.dataset.wrap);
      expect(wraps().every((w) => w === "true")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: /Unwrap/ }));
      expect(wraps().every((w) => w === "false")).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: /^Wrap/ }));
      expect(wraps().every((w) => w === "true")).toBe(true);
    });

    it("hands each hunk's diff its file and hunk, so the panel can load the context around it", () => {
      const { container } = screenWith({ result: { state: "ok", view: withRead(false) } });
      const diff = within(strip(container)).getByTestId("diff");
      expect(diff.dataset.fileHash).toMatch(/\w+/);
      expect(diff.dataset.hunkText).toMatch(/^@@ -1 \+1 @@/);
    });

    it("folds a read hunk to its strip, and opens it again without unreading it", () => {
      const onSetRead = vi.fn();
      const { container } = screenWith({ result: { state: "ok", view: withRead(true) }, onSetRead });
      expect(within(strip(container)).queryByTestId("diff")).toBeNull();
      expect(within(strip(container)).getByText(/Hunk 1 of 2 · reviewed/)).toBeInTheDocument();
      fireEvent.click(within(strip(container)).getByRole("button", { name: /Hunk 1 of 2/ }));
      expect(within(strip(container)).getByTestId("diff")).toBeInTheDocument();
      expect(onSetRead).not.toHaveBeenCalled();
      // A card whose hunks are all read starts folded, and says so in its header.
      const card = container.querySelector<HTMLDetailsElement>('details[data-file-card="src/widget.ts"]')!;
      expect(card.open).toBe(false);
      expect(card.querySelector("[data-file-reviewed]")).toHaveTextContent("1 of 1 hunk reviewed");
    });

    it("shows Viewed only for a file synced with the pull request, and sends it as GitHub's", () => {
      const onSetFileViewed = vi.fn();
      screenWith({ result: { state: "ok", view: withRead(false, "synced") }, onSetFileViewed });
      fireEvent.click(screen.getByRole("checkbox", { name: "Viewed src/widget.ts on GitHub" }));
      expect(onSetFileViewed).toHaveBeenCalledWith("src/widget.ts", true);
    });

    it("with no pull request, labels the Viewed box as the changes panel's", () => {
      const onSetFileViewed = vi.fn();
      screenWith({ result: { state: "ok", view: { ...withRead(false, "synced"), syncWith: "changes-panel" } }, onSetFileViewed });
      expect(screen.queryByRole("checkbox", { name: /on GitHub/ })).toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: "Viewed src/widget.ts in the changes panel" }));
      expect(onSetFileViewed).toHaveBeenCalledWith("src/widget.ts", true);
    });

    it("says a file is not on GitHub yet when it differs, and shows nothing without a pull request", () => {
      const { unmount } = screenWith({ result: { state: "ok", view: withRead(false, "local") } });
      expect(screen.queryByRole("checkbox", { name: /on GitHub/ })).toBeNull();
      expect(screen.getAllByText("not on GitHub yet").length).toBeGreaterThan(0);
      unmount();
      screenWith({ result: { state: "ok", view: withRead(false, "none") } });
      expect(screen.queryByText("not on GitHub yet")).toBeNull();
      expect(screen.queryByRole("checkbox", { name: /on GitHub/ })).toBeNull();
    });

    it("shows what GitHub said when it did not take a change", () => {
      const { container } = screenWith({ result: { state: "ok", view: view() }, notice: "GitHub did not take the change to src/widget.ts: rate limited" });
      expect(container.querySelector("[data-github-notice]")).toHaveTextContent("rate limited");
    });
  });

  it("lists a test concern's scenarios, shows the chosen one, and folds its values", () => {
    const { container } = screenWith({ result: { state: "ok", view: shapes() }, initialSection: "concern-2" });
    expect(screen.getByText("2 scenarios · 1 asserted, 2 snapshot only · 1 not covered")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Scenarios" });
    expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("It works"),
      expect.stringContaining("It refuses"),
    ]);
    const sources = () => screen.getAllByTestId("source").map((el) => [el.dataset.path, el.textContent]);
    expect(sources()[0]).toEqual([expect.stringMatching(/^concern-2\/scenario-1-\w+\.feature$/), expect.stringContaining("(recorded: 3 lines)")]);
    expect(sources()[1]![0]).toMatch(/^concern-2\/not-covered-\w+\.feature$/);

    // Folded and full text get different paths; the same text keeps its path.
    const folded = sources()[0]![0];
    fireEvent.click(screen.getByRole("checkbox", { name: "Show values" }));
    expect(sources()[0]).toEqual([expect.stringMatching(/^concern-2\/scenario-1-\w+\.feature$/), expect.stringContaining('"""')]);
    expect(sources()[0]![0]).not.toBe(folded);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show values" }));
    expect(sources()[0]![0]).toBe(folded);

    fireEvent.click(within(list).getByRole("button", { name: /It refuses/ }));
    expect(sources()[0]![0]).toMatch(/^concern-2\/scenario-2-\w+\.feature$/);
    expect(container.querySelector("[data-file]")).toBeNull();
  });

  it("shows how far through each scenario's hunks you are, checks them all at once, and points to test hunks outside every scenario", () => {
    const onSetRead = vi.fn();
    const v = shapes();
    const snap = "src/__snapshots__/widget.test.ts.snap";
    const tests: ViewTests = {
      ...TESTS,
      scenarios: [
        { ...TESTS.scenarios[0]!, hunks: [{ path: "src/widget.test.ts", index: 0, read: false }, { path: snap, index: 0, read: true }] },
        { ...TESTS.scenarios[1]!, hunks: [{ path: snap, index: 0, read: true }] },
      ],
      outside: [{ path: "src/widget.test.ts", index: 3, read: false }],
    };
    v.concerns[1] = { ...v.concerns[1]!, tests };
    const { container } = screenWith({ result: { state: "ok", view: v }, initialSection: "concern-1", onSetRead });
    const notes = Array.from(container.querySelectorAll("[data-scenario-reviewed]")).map((el) => el.textContent);
    expect(notes).toEqual(["1 of 2 hunks reviewed", "reviewed"]);
    expect(container.querySelector("[data-tests-reviewed]")).toHaveTextContent("1 of 3 test hunks reviewed");

    fireEvent.click(screen.getByRole("button", { name: "Mark read: scenario It works" }));
    expect(onSetRead.mock.calls).toEqual([["src/widget.test.ts", [0], true], [snap, [0], true]]);
    expect(screen.getByRole("button", { name: "Mark unread: scenario It refuses" })).toHaveAttribute("aria-pressed", "true");

    expect(container.querySelector("[data-tests-outside]")).toHaveTextContent("1 test hunk is outside every scenario");
    fireEvent.click(screen.getByRole("button", { name: "Review them in Diff" }));
    expect(container.querySelector('[data-file="src/widget.test.ts"]')).not.toBeNull();
  });

  // Each shape a concern can take, so a change to one does not hide another's changes.
  describe("concern shapes", () => {
    const rendered = (container: HTMLElement) => Array.from(container.querySelectorAll("[data-file][data-hunk]")).map((el) => `${el.getAttribute("data-file")}#${el.getAttribute("data-hunk")}`);
    const railTags = () =>
      within(screen.getByRole("navigation", { name: "Concerns" }))
        .getAllByRole("button")
        .map((b) => b.textContent);

    it("shows a code concern's files with no toggle", () => {
      const { container } = screenWith({ result: { state: "ok", view: shapes() }, initialSection: "concern-0" });
      expect(rendered(container)).toEqual(["src/widget.ts#0"]);
      expect(container.querySelector("[data-mode]")).toBeNull();
      expect(screen.queryByRole("list", { name: "Scenarios" })).toBeNull();
    });

    it("shows a concern's code first and its scenarios under Tests, and Diff swaps only the test files", () => {
      const { container } = screenWith({ result: { state: "ok", view: shapes() }, initialSection: "concern-1" });
      expect(rendered(container)).toEqual(["src/widget.ts#1"]);
      expect(screen.getByRole("heading", { level: 4, name: "Tests" })).toBeInTheDocument();
      expect(container.querySelector("[data-tests-heading] [data-mode]")).not.toBeNull();
      expect(screen.getByRole("list", { name: "Scenarios" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Diff" }));
      expect(rendered(container)).toEqual(["src/widget.ts#1", "src/widget.test.ts#0", "src/__snapshots__/widget.test.ts.snap#0"]);
      expect(screen.queryByRole("list", { name: "Scenarios" })).toBeNull();
    });

    it("puts a test-only concern's toggle beside its title, with no Tests heading", () => {
      const { container } = screenWith({ result: { state: "ok", view: shapes() }, initialSection: "concern-2" });
      expect(rendered(container)).toEqual([]);
      expect(screen.queryByRole("heading", { level: 4, name: "Tests" })).toBeNull();
      expect(container.querySelector("[data-mode]")).not.toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Diff" }));
      expect(rendered(container)).toEqual(["src/gadget.test.ts#0"]);
    });

    it("shows scenarios without a toggle when the concern holds no test files", () => {
      const { container } = screenWith({ result: { state: "ok", view: shapes() }, initialSection: "concern-3" });
      expect(rendered(container)).toEqual(["src/gadget.ts#0"]);
      expect(screen.getByRole("list", { name: "Scenarios" })).toBeInTheDocument();
      expect(container.querySelector("[data-mode]")).toBeNull();
    });

    it("tags only a test-only concern as tests in the rail", () => {
      screenWith({ result: { state: "ok", view: shapes() } });
      expect(railTags()).toEqual([
        expect.not.stringMatching(/tests|scenario/),
        expect.stringContaining("2 scenarios"),
        expect.stringContaining("tests"),
        expect.stringContaining("2 scenarios"),
      ]);
    });

    it("says when the scenarios do not match the test() calls one to one", () => {
      const v = shapes();
      const split = (title: string) => ({ ...TESTS.scenarios[0]!, title, tests: [{ path: "src/gadget.test.ts", test: 1, name: "gadget", cited: 1, total: 2, sharedWith: 1, line: 1, endLine: 1 }] });
      v.concerns[2] = { ...v.concerns[2]!, tests: { ...TESTS, scenarios: [split("First"), split("Second")] } };
      const { container } = screenWith({ result: { state: "ok", view: v }, initialSection: "concern-2" });
      expect(container.querySelector("[data-scenario-mismatch]")).toHaveTextContent(
        '2 scenarios describe 1 test() call, "gadget", so the descriptions do not match the tests one to one.',
      );
      expect(Array.from(container.querySelectorAll("[data-scenario-note]")).map((el) => el.textContent)).toEqual([
        "1 of 2 steps of one test",
        "1 of 2 steps of one test",
      ]);
    });

    it("says nothing when each scenario is one test() call", () => {
      const { container } = screenWith({ result: { state: "ok", view: shapes() }, initialSection: "concern-2" });
      expect(container.querySelector("[data-scenario-mismatch]")).toBeNull();
      expect(container.querySelector("[data-scenario-note]")).toBeNull();
    });

    it("renders every hunk once across the shapes", () => {
      const { container } = screenWith({ result: { state: "ok", view: shapes() } });
      expect(allRenderedKeys(container)).toEqual([
        "src/__snapshots__/widget.test.ts.snap#0",
        "src/gadget.test.ts#0",
        "src/gadget.ts#0",
        "src/widget.test.ts#0",
        "src/widget.ts#0",
        "src/widget.ts#1",
      ]);
    });
  });

  describe("the bar under the headline", () => {
    const segments = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLButtonElement>("[data-branch-bar] [data-bar-file]"));

    it("draws a block per hunk, named by file, and opens the section a block is in", () => {
      const { container } = screenWith({ result: { state: "ok", view: view() } });
      expect(segments(container).map((b) => b.dataset.barFile)).toEqual(["src/widget.ts", "src/widget.ts", "assets/logo.png", "yarn.lock"]);
      expect(within(container.querySelector<HTMLElement>("[data-branch-bar]")!).getByText("widget.ts")).toBeInTheDocument();
      fireEvent.click(segments(container)[1]!);
      expect(screen.getByRole("heading", { level: 3, name: "Second" })).toBeInTheDocument();
    });

    it("groups files by directory past 30, with a sliver per file", () => {
      const many = Array.from({ length: 31 }, (_, i) => ({ path: `src/f${i}.ts`, hunks: [{ index: 0, lines: 1, read: false, section: "concern-0" }] }));
      const { container } = screenWith({ result: { state: "ok", view: { ...view(), files: many } } });
      expect(segments(container)).toHaveLength(31);
      expect(within(container.querySelector<HTMLElement>("[data-branch-bar]")!).getByText("src/")).toBeInTheDocument();
    });

    it("says whether bb lists the same files", () => {
      const v = view();
      const { container, rerender } = screenWith({ result: { state: "ok", view: { ...v, crossCheck: { status: "agree", onlyBb: [], onlyHere: [], reason: null } } } });
      expect(container.querySelector("[data-cross-check]")).toHaveTextContent("same files as bb");
      rerender(
        <ReviewScreen
          result={{ state: "ok", view: { ...v, crossCheck: { status: "differ", onlyBb: ["docs/export.md"], onlyHere: [], reason: null } } }}
          error={null}
          generating={false}
          onGenerate={() => {}}
          onSetRead={() => {}}
          onSetFileViewed={() => {}}
          DiffView={DiffView}
          SourceView={SourceView}
        />,
      );
      expect(container.querySelector("[data-cross-check='differ']")).toHaveTextContent("bb also lists docs/export.md");
    });
  });

  it("shows the stale banner and Regenerate", () => {
    const onGenerate = vi.fn();
    const stale = {
      ...view(),
      stale: {
        groupedAt: "2026-10-05T12:00:00.000Z",
        groupedHead: "abc1234def",
        commitsSince: 2,
        changedFiles: [{ path: "src/widget.ts", patch: "@@ -1 +1 @@\n-b\n+e\n" }],
      },
    };
    screenWith({ result: { state: "ok", view: stale }, onGenerate });
    expect(screen.getByText(/2 commits and 1 file changed since/)).toBeInTheDocument();
    expect(screen.getByText("Changed since grouping")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows why the review is unavailable", () => {
    screenWith({ result: { state: "unavailable", message: "Super Diff needs a git checkout, and this environment is not one." } });
    expect(screen.getByText(/needs a git checkout/)).toBeInTheDocument();
  });
});
