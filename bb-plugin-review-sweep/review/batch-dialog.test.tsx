// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BatchPicker, type BatchStart } from "./batch-dialog.js";
import type { Row } from "./list-view.js";

afterEach(cleanup);

const now = Date.parse("2026-03-10T12:00:00Z");

function row(number: number, overrides: Partial<Row> = {}): Row {
  return {
    repo: "acme/widgets",
    number,
    title: `Widget change ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    author: "octocat",
    isDraft: false,
    state: "first-look",
    requestedAt: now - 3_600_000,
    lastReviewedAt: null,
    requestedReviewers: ["you"],
    size: { additions: 10, deletions: 2, changedFiles: 1 },
    canSpawn: true,
    threadId: null,
    comments: 0,
    checks: { pass: 3, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 3 },
    reviewers: [],
    stack: null,
    note: null,
    newComments: 0,
    ...overrides,
  };
}

const ROWS = [row(1), row(2, { state: "re-review" }), row(3, { isDraft: true })];

function renderPicker(onStart = vi.fn(async (_starts: BatchStart[]) => {})) {
  render(<BatchPicker rows={ROWS} now={now} onStart={onStart} onCancel={() => {}} />);
  return onStart;
}

const startButton = () => screen.getByRole("button", { name: /^Start/ });
const prompt = () => screen.getByLabelText(/Prompt for #/) as HTMLTextAreaElement;

describe("BatchPicker", () => {
  it("starts with nothing ticked and nothing to start", () => {
    renderPicker();
    expect(startButton()).toHaveTextContent("Start reviews");
    expect(startButton()).toBeDisabled();
    expect(screen.getByText(/Tick a request to read and edit/)).toBeInTheDocument();
  });

  it("shows the last ticked request's prompt, seeded as Start review would", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #2" }));

    expect(screen.getByText("Prompt for #2")).toBeInTheDocument();
    expect(prompt().value).toMatch(/Because this is a re-review/);
    expect(startButton()).toHaveTextContent("Start 2 reviews");
  });

  it("switches the prompt when a ticked title is clicked, and ticks an unticked one", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #2" }));

    fireEvent.click(screen.getByRole("button", { name: "Widget change 1" }));
    expect(screen.getByText("Prompt for #1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Widget change 3" }));
    expect(screen.getByText("Prompt for #3")).toBeInTheDocument();
    expect(startButton()).toHaveTextContent("Start 3 reviews");
  });

  it("moves to the ticked request above when the shown one is unticked", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #1" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #2" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #2" }));
    expect(screen.getByText("Prompt for #1")).toBeInTheDocument();
  });

  it("keeps an edit, marks it, and resets it", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #1" }));
    const seeded = prompt().value;

    fireEvent.change(prompt(), { target: { value: "Only the tests, please." } });
    expect(screen.getByText("edited")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(prompt().value).toBe(seeded);
    expect(screen.queryByText("edited")).not.toBeInTheDocument();
  });

  it("passes every ticked request with its prompt as it stands", () => {
    const onStart = renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #1" }));
    fireEvent.change(prompt(), { target: { value: "Only the tests, please." } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #2" }));

    fireEvent.click(startButton());

    const [starts] = onStart.mock.calls[0]!;
    expect(starts.map((start) => [start.row.number, start.prompt])).toEqual([
      [1, "Only the tests, please."],
      [2, expect.stringMatching(/Because this is a re-review/)],
    ]);
  });

  it("will not start a review whose prompt was emptied", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick #1" }));
    fireEvent.change(prompt(), { target: { value: "  " } });

    expect(screen.getByText("The prompt for #1 is empty.")).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
  });
});
