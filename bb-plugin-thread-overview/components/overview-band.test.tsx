// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Overview, Step } from "@/overview/types";
import { OverviewBand } from "./overview-band";

afterEach(cleanup);

function step(id: string, text: string, status: Step["status"], source: Step["source"] = "agent"): Step {
  return { id, threadId: "t1", text, status, source, position: Number(id.slice(1)), createdAt: 0, updatedAt: 0 };
}

const NOW = 1_000_000_000;

const overview: Overview = {
  threadId: "t1",
  summary: "Add a CSV export to the widgets report.",
  steps: [
    step("s1", "Find where the report builds its rows", "done"),
    step("s2", "Write the export and its tests", "current"),
    step("s3", "Ask finance which months they need", "todo", "user"),
  ],
  updatedAt: NOW - 12 * 60_000,
  expanded: true,
};

function renderBand(props: Partial<Parameters<typeof OverviewBand>[0]> = {}) {
  const handlers = {
    onCycle: vi.fn(),
    onSaveSummary: vi.fn(),
    onAdd: vi.fn(),
    onRemove: vi.fn(),
    onToggle: vi.fn(),
  };
  render(<OverviewBand overview={overview} now={NOW} expanded {...handlers} {...props} />);
  return handlers;
}

describe("OverviewBand", () => {
  it("shows the summary, every step, and when it changed", () => {
    renderBand();
    expect(screen.getByText("Add a CSV export to the widgets report.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Write the export and its tests, current/ })).toBeTruthy();
    expect(screen.getByText("updated 12 min ago")).toBeTruthy();
  });

  it("collapses to the step count, current step, and summary", () => {
    renderBand({ expanded: false });
    const line = screen.getByRole("region", { name: "Thread overview" }).textContent;
    expect(line).toContain("2/3");
    expect(line).toContain("Write the export and its tests");
    expect(line).toContain("Add a CSV export");
  });

  it("cycles a step when clicked", () => {
    const handlers = renderBand();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 completed" }));
    fireEvent.click(screen.getByRole("button", { name: /Find where the report builds its rows, done/ }));
    expect(handlers.onCycle).toHaveBeenCalledWith(overview.steps[0]);
  });

  it("offers remove only on steps you added", () => {
    renderBand();
    expect(screen.getByRole("button", { name: "Remove Ask finance which months they need" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove Write the export and its tests" })).toBeNull();
  });

  it("edits the summary in place", () => {
    const handlers = renderBand();
    fireEvent.click(screen.getByRole("button", { name: "Edit summary" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Thread summary" }), {
      target: { value: "Add CSV and PDF exports." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handlers.onSaveSummary).toHaveBeenCalledWith("Add CSV and PDF exports.");
  });

  it("adds a step of yours", () => {
    const handlers = renderBand();
    fireEvent.click(screen.getByRole("button", { name: "+ Add step" }));
    const input = screen.getByRole("textbox", { name: "New step" });
    fireEvent.change(input, { target: { value: "Update the help text" } });
    fireEvent.submit(input.closest("form")!);
    expect(handlers.onAdd).toHaveBeenCalledWith("Update the help text");
  });

  it("puts Add step first, then unfinished steps, with completed ones behind a toggle", () => {
    renderBand();
    const names = () =>
      screen
        .getAllByRole("button", { name: /Click to change/ })
        .map((button) => button.getAttribute("aria-label")!.split(",")[0]);
    expect(names()).toEqual(["Write the export and its tests", "Ask finance which months they need"]);
    const list = screen.getByRole("list", { name: "Steps" });
    expect(list.firstElementChild?.textContent).toBe("+ Add step");

    fireEvent.click(screen.getByRole("button", { name: "Show 1 completed" }));
    expect(names()).toEqual([
      "Write the export and its tests",
      "Ask finance which months they need",
      "Find where the report builds its rows",
    ]);
    expect(screen.getByRole("button", { name: "Hide completed" })).toBeTruthy();
  });

  it("collapses from the bottom edge too", () => {
    const handlers = renderBand();
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(handlers.onToggle).toHaveBeenCalled();
  });

  it("keeps a thread with no summary and nothing left to one quiet line", () => {
    const steps = Array.from({ length: 12 }, (_, i) => step(`s${i + 1}`, `Finished ${i + 1}`, "done"));
    renderBand({ overview: { ...overview, summary: "", steps } });
    expect(screen.getByText("· 12 steps done earlier")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Thread overview" })).toBeNull();
  });

  it("offers to write one when there is no overview", () => {
    const handlers = renderBand({ overview: { ...overview, summary: "", steps: [] } });
    fireEvent.click(screen.getByRole("button", { name: "Write one" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Thread summary" }), {
      target: { value: "Fix the flaky export test." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handlers.onSaveSummary).toHaveBeenCalledWith("Fix the flaky export test.");
  });
});
