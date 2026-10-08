// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Segmented, SegmentedToggle } from "./segmented";

afterEach(cleanup);

const OPTIONS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week", count: 12, title: "The last seven days" },
] as const;

describe("Segmented", () => {
  it("marks the chosen option and reports a new one", () => {
    const onChange = vi.fn();
    render(<Segmented label="Period" options={OPTIONS} value="day" onChange={onChange} />);
    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Day" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Week 12" }));
    expect(onChange).toHaveBeenCalledWith("week");
  });

  it("shows an option's count and title", () => {
    render(<Segmented label="Period" options={OPTIONS} value="day" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Week 12" })).toHaveAttribute("title", "The last seven days");
  });
});

describe("SegmentedToggle", () => {
  it("turns an option on, and off again when it is pressed a second time", () => {
    const onChange = vi.fn();
    const { rerender } = render(<SegmentedToggle label="Filter" options={OPTIONS} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(onChange).toHaveBeenLastCalledWith("day");

    rerender(<SegmentedToggle label="Filter" options={OPTIONS} value="day" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Day" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
