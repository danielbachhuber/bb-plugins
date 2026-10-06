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
    expect(screen.getByText("1 of 3 files viewed")).toBeInTheDocument();
  });

  it("moves to the next concern from the bottom of the page", () => {
    screenWith({ result: { state: "ok", view: view() } });
    fireEvent.click(screen.getByRole("button", { name: /^Next: Second/ }));
    expect(screen.getByRole("heading", { level: 3, name: "Second" })).toBeInTheDocument();
    expect(screen.getByText("hunk 2 of 2")).toBeInTheDocument();
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
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Viewed src/widget.ts" }));
    expect(onSetViewed).toHaveBeenCalledWith("src/widget.ts", true);
  });

  it("lists a test concern's scenarios, shows the chosen one, and its diff on Diff", () => {
    const v = view();
    v.concerns[1]!.tests = {
      scenarios: [
        { title: "It works", asserted: 1, snapshotOnly: 1, steps: "Scenario: It works\n  # 1.1 x toMatchSnapshot  (recorded: 3 lines)", values: 'Scenario: It works\n  """\n  {}\n  """' },
        { title: "It refuses", asserted: 0, snapshotOnly: 1, steps: "Scenario: It refuses", values: "Scenario: It refuses" },
      ],
      notCovered: "Feature: Not covered by these tests\n\n  @untested",
      asserted: 1,
      snapshotOnly: 2,
      gaps: 1,
      snapshots: 2,
    };
    const { container } = screenWith({ result: { state: "ok", view: v } });
    fireEvent.click(within(screen.getByRole("navigation", { name: "Concerns" })).getByRole("button", { name: /Second/ }));
    expect(screen.getByText("2 scenarios · 1 asserted, 2 snapshot only · 1 not covered")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Scenarios" });
    expect(within(list).getAllByRole("button").map((b) => b.textContent)).toEqual([
      expect.stringContaining("It works"),
      expect.stringContaining("It refuses"),
    ]);
    const sources = () => screen.getAllByTestId("source").map((el) => [el.dataset.path, el.textContent]);
    expect(sources()[0]).toEqual([expect.stringMatching(/^concern-1\/scenario-1-\w+\.feature$/), expect.stringContaining("(recorded: 3 lines)")]);
    expect(sources()[1]![0]).toMatch(/^concern-1\/not-covered-\w+\.feature$/);

    // Folded and full text get different paths; the same text keeps its path.
    const folded = sources()[0]![0];
    fireEvent.click(screen.getByRole("checkbox", { name: "Show values" }));
    expect(sources()[0]).toEqual([expect.stringMatching(/^concern-1\/scenario-1-\w+\.feature$/), expect.stringContaining('"""')]);
    expect(sources()[0]![0]).not.toBe(folded);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show values" }));
    expect(sources()[0]![0]).toBe(folded);
    fireEvent.click(screen.getByRole("checkbox", { name: "Show values" }));

    fireEvent.click(within(list).getByRole("button", { name: /It refuses/ }));
    expect(sources()[0]![0]).toMatch(/^concern-1\/scenario-2-\w+\.feature$/);

    expect(container.querySelector("[data-file]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Diff" }));
    expect(container.querySelector('[data-file="src/widget.ts"][data-hunk="1"]')).not.toBeNull();
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
