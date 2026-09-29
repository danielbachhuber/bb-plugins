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
    expect(screen.getByTitle("In progress")).toBeInTheDocument();
  });

  it("shows the off-track content when the row has no stage", () => {
    render(<Track stages={STAGES} stage={null} offTrack="Stalled" />);
    expect(screen.getByText("Stalled")).toBeInTheDocument();
  });
});
