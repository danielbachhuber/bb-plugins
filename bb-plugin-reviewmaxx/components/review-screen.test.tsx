// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewView } from "@/review/contract";
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
    <ReviewScreen error={null} generating={false} onGenerate={() => {}} onSetViewed={() => {}} DiffView={DiffView} SourceView={SourceView} {...props} />,
  );
}

const DiffView = ({ patch, path }: { patch: string; path: string }) => (
  <pre data-testid="diff" data-path={path}>
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

describe("ReviewScreen", () => {
  it("renders every item exactly once with its data attributes", () => {
    const { container } = render(
      <ReviewScreen result={{ state: "ok", view: view() }} error={null} generating={false} onGenerate={() => {}} onSetViewed={() => {}} DiffView={DiffView} SourceView={SourceView} />,
    );
    const keys = Array.from(container.querySelectorAll("[data-file][data-hunk]"))
      .filter((el) => el.getAttribute("data-status") !== "removed")
      .map((el) => `${el.getAttribute("data-file")}#${el.getAttribute("data-hunk")}`)
      .sort();
    expect(keys).toEqual(["assets/logo.png#0", "src/widget.ts#0", "src/widget.ts#1", "yarn.lock#0"]);
    expect(container.querySelector("[data-reviewmaxx]")).toHaveAttribute("data-reviewmaxx", "ready");
    expect(screen.getByText("The widget changes twice.")).toBeInTheDocument();
    expect(screen.getByText("3 files, 4 hunks, all shown")).toBeInTheDocument();
    expect(screen.getAllByText("hunk 1 of 2")).toHaveLength(1);
  });

  it("opens the first concern and collapses Mechanical", () => {
    const { container } = render(
      <ReviewScreen result={{ state: "ok", view: view() }} error={null} generating={false} onGenerate={() => {}} onSetViewed={() => {}} DiffView={DiffView} SourceView={SourceView} />,
    );
    const sections = Array.from(container.querySelectorAll<HTMLDetailsElement>("details[data-section]"));
    expect(sections.map((s) => [s.dataset.section, s.open])).toEqual([
      ["concern-0", true],
      ["concern-1", false],
      ["mechanical", false],
    ]);
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
    screenWith({ result: { state: "unavailable", message: "Reviewmaxx needs a git checkout, and this environment is not one." } });
    expect(screen.getByText(/needs a git checkout/)).toBeInTheDocument();
  });

  it("lists the concerns in an outline, and counts viewed files", () => {
    const v = view();
    v.concerns[0]!.files[1]!.viewed = true;
    v.coverage.viewed = 1;
    screenWith({ result: { state: "ok", view: v } });
    const outline = screen.getByRole("list", { name: "Concerns" });
    expect(within(outline).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("First"),
      expect.stringContaining("Second"),
      expect.stringContaining("Mechanical"),
    ]);
    expect(screen.getByText("1 of 3 files viewed")).toBeInTheDocument();
  });

  it("folds a viewed file and reports a new mark", () => {
    const onSetViewed = vi.fn();
    const v = view();
    v.concerns[0]!.files[1]!.viewed = true;
    const { container } = screenWith({ result: { state: "ok", view: v }, onSetViewed });
    const cards = Array.from(container.querySelectorAll<HTMLDetailsElement>("details[data-file-card]"));
    expect(cards.map((c) => [c.dataset.fileCard, c.open])).toEqual([
      ["src/widget.ts", true],
      ["assets/logo.png", false],
      ["src/widget.ts", true],
      ["yarn.lock", true],
    ]);
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Viewed src/widget.ts" })[0]!);
    expect(onSetViewed).toHaveBeenCalledWith("src/widget.ts", true);
  });

  it("shows a test concern as scenarios first, and its diff on Diff", () => {
    const v = view();
    v.concerns[1]!.tests = { covered: "Feature: Second\n  Scenario: It works", notCovered: "Feature: Not covered by these tests\n\n  @untested", scenarios: 1, asserted: 1, snapshotOnly: 2, gaps: 1, snapshots: 2 };
    const { container } = screenWith({ result: { state: "ok", view: v } });
    const second = container.querySelector<HTMLElement>('[data-section="concern-1"]')!;
    expect(within(second).getAllByTestId("source").map((el) => el.dataset.path)).toEqual(["scenarios.feature", "not-covered.feature"]);
    expect(within(second).getByText("1 scenario · 1 asserted, 2 snapshot only · 1 not covered")).toBeInTheDocument();
    expect(second.querySelector("[data-file]")).toBeNull();
    fireEvent.click(within(second).getByRole("button", { name: "Diff" }));
    expect(second.querySelector('[data-file="src/widget.ts"][data-hunk="1"]')).not.toBeNull();
  });
});
