// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { SweepList, type SweepLinkProps, type SweepListProps } from "./list";
import type { Run, Stage, SweepItem } from "./types";

afterEach(cleanup);

const STAGES: Stage[] = [
  { name: "Backlog", color: "bg-slate-400" },
  { name: "Ready", color: "bg-sky-500" },
  { name: "In progress", color: "bg-amber-500" },
];

const RUNS: Run[] = [
  { id: "new", label: "new comments", labelOne: "new comment", tone: "new", tier: "now" },
  { id: "to-start", label: "to start", labelOne: "to start", tone: "next", tier: "next" },
  { id: "later", label: "later", labelOne: "later", tone: "later", tier: "later" },
];

function item(number: number, runId: string, overrides: Partial<SweepItem> = {}): SweepItem {
  return {
    key: `acme/widgets#${number}`,
    runId,
    title: `Widget task ${number}`,
    url: `https://github.com/acme/widgets/issues/${number}`,
    number,
    newComments: 0,
    flags: [],
    facts: ["3h ago"],
    parent: null,
    note: null,
    stage: 0,
    ...overrides,
  };
}

function props(items: SweepItem[], overrides: Partial<SweepListProps> = {}): SweepListProps {
  return {
    noun: "issues",
    stages: STAGES,
    runs: RUNS,
    items,
    renderActions: () => <button type="button">Start thread</button>,
    onNoteSave: async () => true,
    ...overrides,
  };
}

/** The row whose title link reads `title`. */
function row(title: string): HTMLElement {
  return screen.getByRole("link", { name: title }).closest("li")!;
}

const later = (count: number, start = 300) => Array.from({ length: count }, (_, i) => item(start + i, "later"));

describe("SweepList", () => {
  it("opens Now rows, closes Next rows, and opens a Next row from its chevron", () => {
    render(<SweepList {...props([item(1, "new", { newComments: 2 }), item(2, "to-start")])} />);
    expect(within(row("Widget task 1")).getByRole("button", { name: "Start thread" })).toBeInTheDocument();
    expect(within(row("Widget task 1")).getByRole("button", { name: "Add note" })).toBeInTheDocument();
    expect(within(row("Widget task 2")).queryByRole("button", { name: "Start thread" })).toBeNull();

    fireEvent.click(within(row("Widget task 2")).getByRole("button", { name: "Expand" }));
    expect(within(row("Widget task 2")).getByRole("button", { name: "Start thread" })).toBeInTheDocument();
  });

  it("folds Later after laterShown rows and shows the rest on request", () => {
    render(<SweepList {...props(later(8))} laterShown={5} />);
    expect(screen.getAllByRole("link")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "3 more" }));
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: /more$/ })).toBeNull();
  });

  it("opens every row from Expand all, which then reads Collapse all", () => {
    render(<SweepList {...props([item(1, "new"), item(2, "to-start"), ...later(2)])} />);
    expect(screen.getByText("4 issues")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getAllByRole("button", { name: "Start thread" })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.getAllByRole("button", { name: "Start thread" })).toHaveLength(1);
  });

  it("filters to a run from the summary, and clears on a second press", () => {
    render(<SweepList {...props([item(1, "new"), item(2, "to-start"), ...later(2)])} />);
    fireEvent.click(screen.getByRole("button", { name: /to start/ }));
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Widget task 2"]);
    fireEvent.click(screen.getByRole("button", { name: /to start/ }));
    expect(screen.getAllByRole("link")).toHaveLength(4);
  });

  it("names a run of one in the singular", () => {
    render(<SweepList {...props([item(1, "new"), item(2, "new"), item(3, "to-start")])} />);
    expect(screen.getByRole("button", { name: "2 new comments" })).toBeInTheDocument();
    render(<SweepList {...props([item(4, "new")])} />);
    expect(screen.getByRole("button", { name: "1 new comment" })).toBeInTheDocument();
  });

  it("shows every Later row of a chosen run, with no fold", () => {
    render(<SweepList {...props([item(1, "new"), ...later(8)])} laterShown={5} />);
    fireEvent.click(screen.getByRole("button", { name: /later/ }));
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: /more$/ })).toBeNull();
  });

  it("clears the filter when a new list empties the chosen run", () => {
    const { rerender } = render(<SweepList {...props([item(1, "new"), item(2, "to-start")])} />);
    fireEvent.click(screen.getByRole("button", { name: "1 new comment" }));
    expect(screen.getAllByRole("link")).toHaveLength(1);

    rerender(<SweepList {...props([item(2, "to-start"), item(3, "later")])} />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Widget task 2", "Widget task 3"]);
    expect(screen.getByRole("button", { name: /to start/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("draws a list of only Later rows with its summary and fold", () => {
    render(<SweepList {...props(later(7))} />);
    expect(screen.getByRole("group", { name: "Rows by run" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "2 more" })).toBeInTheDocument();
  });

  it("calls onOpenLink from the title, and saves a note through the list's own field", async () => {
    const onOpenLink = vi.fn();
    const onNoteSave = vi.fn(async () => true);
    render(<SweepList {...props([item(1, "new")], { onOpenLink, onNoteSave })} />);
    fireEvent.click(screen.getByRole("link", { name: "Widget task 1" }));
    expect(onOpenLink).toHaveBeenCalledWith(expect.objectContaining({ number: 1 }));

    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const field = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(field, { target: { value: "  Ask about the hinge  " } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onNoteSave).toHaveBeenCalledWith(expect.objectContaining({ number: 1 }), "Ask about the hinge");
    expect(await screen.findByRole("button", { name: "Add note" })).toBeInTheDocument();
  });

  it("draws the title and parent chip through a custom Link", () => {
    const onOpenLink = vi.fn();
    function Link({ href, className, onClick, children }: SweepLinkProps) {
      return (
        <a href={href} className={className} onClick={onClick} data-custom-link="">
          {children}
        </a>
      );
    }
    const parent = { number: 7, title: "Widget roadmap", url: "https://github.com/acme/widgets/issues/7" };
    render(<SweepList {...props([item(1, "new", { parent })], { Link, onOpenLink })} />);
    const title = screen.getByRole("link", { name: "Widget task 1" });
    expect(title).toHaveAttribute("data-custom-link");
    expect(screen.getByRole("link", { name: "Widget roadmap" })).toHaveAttribute("data-custom-link");
    fireEvent.click(title);
    expect(onOpenLink).toHaveBeenCalledWith(expect.objectContaining({ number: 1 }));
  });

  it("marks unread rows and shows flags on the number line", () => {
    render(
      <SweepList
        {...props([
          item(1, "new", { newComments: 3, flags: [{ kind: "stale", text: "No activity for 12 days" }] }),
          item(2, "to-start", { flags: [{ kind: "blocked", text: "Blocked by #9" }] }),
        ])}
      />,
    );
    expect(within(row("Widget task 1")).getByText("3 new")).toBeInTheDocument();
    expect(within(row("Widget task 1")).getByLabelText("New")).toBeInTheDocument();
    expect(within(row("Widget task 1")).getByText("No activity for 12 days")).toBeInTheDocument();
    expect(row("Widget task 1").className).toContain("border-l-destructive");
    expect(row("Widget task 2").className).toContain("border-l-slate-400");
  });
});
