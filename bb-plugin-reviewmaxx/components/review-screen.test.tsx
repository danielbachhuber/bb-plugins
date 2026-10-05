// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewView } from "@/review/contract";
import { parseDiff } from "@/review/items";
import { buildView } from "@/review/view";
import { ReviewScreen } from "./review-screen";

afterEach(cleanup);

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
      <ReviewScreen result={{ state: "ok", view: view() }} error={null} generating={false} onGenerate={() => {}} DiffView={DiffView} />,
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
      <ReviewScreen result={{ state: "ok", view: view() }} error={null} generating={false} onGenerate={() => {}} DiffView={DiffView} />,
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
    render(<ReviewScreen result={{ state: "ok", view: stale }} error={null} generating={false} onGenerate={onGenerate} DiffView={DiffView} />);
    expect(screen.getByText(/2 commits and 1 file changed since/)).toBeInTheDocument();
    expect(screen.getByText("Changed since grouping")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("shows why the review is unavailable", () => {
    render(
      <ReviewScreen
        result={{ state: "unavailable", message: "Reviewmaxx needs a git checkout, and this environment is not one." }}
        error={null}
        generating={false}
        onGenerate={() => {}}
        DiffView={DiffView}
      />,
    );
    expect(screen.getByText(/needs a git checkout/)).toBeInTheDocument();
  });
});
