// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { Track } from "./track";
import type { Stage } from "./types";

afterEach(cleanup);

const STAGES: Stage[] = [
  { name: "Backlog", color: "bg-slate-400" },
  { name: "Ready", color: "bg-sky-500" },
  { name: "In progress", color: "bg-amber-500" },
];

describe("Track", () => {
  it("moves a row to the stage whose dot is clicked", () => {
    const onMove = vi.fn();
    render(<Track stages={STAGES} stage={0} onMove={onMove} />);
    fireEvent.click(screen.getByRole("button", { name: "Move to Ready" }));
    expect(onMove).toHaveBeenCalledWith(1);
  });

  it("draws dots without buttons when nothing can move", () => {
    render(<Track stages={STAGES} stage={2} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("names every stage under its dot, the current one bold and the rest muted", () => {
    render(<Track stages={STAGES} stage={1} />);
    expect(screen.getByText("Ready")).toHaveClass("font-medium", "text-foreground");
    for (const name of ["Backlog", "In progress"]) {
      expect(screen.getByText(name)).not.toHaveClass("font-medium");
      expect(screen.getByText(name).className).toContain("text-muted-foreground");
    }
  });

  it("draws a blocked stage as a red disc with a cross, and names it in red", () => {
    render(<Track stages={STAGES} stage={1} blocked={2} />);
    expect(screen.getByText("In progress")).toHaveClass("font-medium", "text-destructive-text");
    const cross = screen.getByLabelText("Blocked at In progress");
    expect(cross).toHaveClass("bg-destructive");
    expect(cross.querySelector('[data-icon="X"]')).not.toBeNull();
    expect(screen.getByText("Ready")).toHaveClass("text-foreground");
  });

  it("marks nothing blocked when blocked is null", () => {
    render(<Track stages={STAGES} stage={1} blocked={null} />);
    expect(screen.queryByLabelText(/^Blocked at/)).toBeNull();
  });

  it("shows the off-track content when the row has no stage", () => {
    render(<Track stages={STAGES} stage={null} offTrack="Stalled" />);
    expect(screen.getByText("Stalled")).toBeInTheDocument();
    expect(screen.queryByText("Backlog")).toBeNull();
  });
});
