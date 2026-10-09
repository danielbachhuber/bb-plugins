// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DateRange, dayRangeLabel } from "./date-range";

afterEach(cleanup);

const day = (month: number, date: number) => new Date(2026, month, date).getTime();
const SEP_19_TO_OCT_9 = { from: day(8, 19), to: day(9, 10) };

describe("dayRangeLabel", () => {
  it("names the first and last day, not the exclusive end", () => {
    expect(dayRangeLabel(SEP_19_TO_OCT_9, "Custom")).toBe("Sep 19 to Oct 9");
  });

  it("falls back to the placeholder when nothing is picked", () => {
    expect(dayRangeLabel(null, "Custom")).toBe("Custom");
  });

  it("reads a single day as that day twice", () => {
    expect(dayRangeLabel({ from: day(9, 9), to: day(9, 10) }, "Custom")).toBe("Oct 9 to Oct 9");
  });
});

describe("DateRange", () => {
  it("shows the placeholder until a range is picked", () => {
    render(<DateRange value={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
  });

  it("opens the calendar on click and closes it on Escape", () => {
    render(<DateRange value={null} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    expect(screen.getByRole("dialog", { name: "Choose a date range" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cannot apply before a first day is picked", () => {
    render(<DateRange value={null} onChange={vi.fn()} defaultOpen />);
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(screen.getByText("Pick the first day")).toBeInTheDocument();
  });

  it("opens on the range already applied, and applies it unchanged", () => {
    const onChange = vi.fn();
    render(<DateRange value={SEP_19_TO_OCT_9} onChange={onChange} defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith(SEP_19_TO_OCT_9);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("leaves the applied range alone when it is cancelled", () => {
    const onChange = vi.fn();
    render(<DateRange value={SEP_19_TO_OCT_9} onChange={onChange} defaultOpen />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
