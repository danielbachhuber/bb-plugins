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

  it("draws no header: no row count and no Expand all", () => {
    render(<SweepList {...props([item(1, "new"), item(2, "to-start"), ...later(2)])} />);
    expect(screen.queryByText("4 issues")).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Expand|Collapse) all$/ })).toBeNull();
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

  it("keeps a forceOpen row open in any tier, with no chevron to close it", () => {
    render(
      <SweepList
        {...props([item(1, "to-start", { forceOpen: true }), item(2, "later", { forceOpen: true }), item(3, "to-start")])}
      />,
    );
    for (const title of ["Widget task 1", "Widget task 2"]) {
      expect(within(row(title)).getByRole("button", { name: "Start thread" })).toBeInTheDocument();
      expect(within(row(title)).queryByRole("button", { name: /^(Collapse|Expand)$/ })).toBeNull();
    }
    expect(within(row("Widget task 3")).queryByRole("button", { name: "Start thread" })).toBeNull();

  });

  it("shows a one-line Later row's first flag in place of its first fact, in the flag's color", () => {
    render(
      <SweepList
        {...props([
          item(1, "later", { facts: ["3d ago", "acme/gadgets"], flags: [{ kind: "stale", text: "No activity for 9 days" }] }),
          item(2, "later", { facts: ["5h ago"] }),
        ])}
      />,
    );
    const flagged = row("Widget task 1");
    expect(within(flagged).getByText("No activity for 9 days")).toHaveClass("text-destructive-text");
    expect(within(flagged).queryByText("3d ago")).toBeNull();
    expect(within(row("Widget task 2")).getByText("5h ago")).toBeInTheDocument();
  });

  it("names the stages under every row's track, and marks a blocked stage", () => {
    render(<SweepList {...props([item(1, "new", { stage: 1, blockedStage: 2 }), item(2, "to-start")])} />);
    expect(within(row("Widget task 1")).getByText("Ready")).toHaveClass("text-foreground");
    expect(within(row("Widget task 1")).getByLabelText("Blocked at In progress")).toBeInTheDocument();
    expect(within(row("Widget task 2")).getByText("Backlog")).toHaveClass("text-foreground");
    expect(within(row("Widget task 2")).queryByLabelText(/^Blocked at/)).toBeNull();
  });

  describe("with renderBody", () => {
    const body = (subject: SweepItem, open: boolean, line: boolean) => (
      <span data-testid={`body-${subject.number}`}>{`body ${open ? "open" : "closed"}${line ? " line" : ""}`}</span>
    );
    const icon = <span data-testid="state-icon" />;

    it("draws the icon, title, number, new count, and age on the title line, then the body, then the note and actions when open", () => {
      render(
        <SweepList
          {...props(
            [item(1, "new", { icon, newComments: 2, facts: ["2h ago", "acme/gadgets"], note: "Ask about the hinge" })],
            { renderBody: body },
          )}
        />,
      );
      const open = row("Widget task 1");
      expect(within(open).getByTestId("state-icon")).toBeInTheDocument();
      expect(within(open).getByText("#1")).toBeInTheDocument();
      expect(within(open).getByText("2 new")).toBeInTheDocument();
      expect(within(open).getByText("2h ago")).toBeInTheDocument();
      // The rest of the facts are the body's to draw.
      expect(within(open).queryByText("acme/gadgets")).toBeNull();
      expect(within(open).getByText("body open")).toBeInTheDocument();
      expect(within(open).getByText("Ask about the hinge")).toBeInTheDocument();
      expect(within(open).getByRole("button", { name: "Start thread" })).toBeInTheDocument();
      expect(within(open).getByRole("button", { name: "Edit note" })).toBeInTheDocument();
      // The body comes after the title line and before the note.
      const text = open.textContent ?? "";
      expect(text.indexOf("2h ago")).toBeLessThan(text.indexOf("body open"));
      expect(text.indexOf("body open")).toBeLessThan(text.indexOf("Ask about the hinge"));
    });

    it("draws a closed Next row's body without its note or actions", () => {
      render(<SweepList {...props([item(2, "to-start", { note: "Later" })], { renderBody: body })} />);
      const closed = row("Widget task 2");
      expect(within(closed).getByText("body closed")).toBeInTheDocument();
      expect(within(closed).queryByText("Later")).toBeNull();
      expect(within(closed).queryByRole("button", { name: "Start thread" })).toBeNull();
    });

    it("draws a one-line Later row's body inline in place of its first fact", () => {
      render(<SweepList {...props([item(3, "later", { icon, facts: ["5h ago"] })], { renderBody: body })} />);
      const line = row("Widget task 3");
      expect(within(line).getByTestId("state-icon")).toBeInTheDocument();
      expect(within(line).getByText("#3")).toBeInTheDocument();
      expect(within(line).getByText("body closed line")).toBeInTheDocument();
      expect(within(line).queryByText("5h ago")).toBeNull();
    });

    it("leaves rows without renderBody drawn with their number line", () => {
      render(<SweepList {...props([item(4, "new", { facts: ["3h ago", "acme/gadgets"] })])} />);
      expect(within(row("Widget task 4")).getByText("acme/gadgets")).toBeInTheDocument();
    });
  });
});
