// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StatusBanner } from "./banner";

afterEach(cleanup);

describe("StatusBanner", () => {
  it("draws a blocked banner in red with an alert icon", () => {
    render(<StatusBanner tone="blocked">Merge conflict with main</StatusBanner>);
    const banner = screen.getByText("Merge conflict with main").closest("[data-tone]")!;
    expect(banner).toHaveAttribute("data-tone", "blocked");
    expect(banner).toHaveClass("bg-destructive/[0.07]");
    expect(screen.getByText("Merge conflict with main")).toHaveClass("text-destructive-text", "font-medium");
    expect(banner.querySelector('[data-icon="AlertCircle"]')).not.toBeNull();
  });

  it("draws a ready banner in green with a check icon", () => {
    render(<StatusBanner tone="ready">Ready to merge</StatusBanner>);
    const banner = screen.getByText("Ready to merge").closest("[data-tone]")!;
    expect(banner).toHaveAttribute("data-tone", "ready");
    expect(banner).toHaveClass("bg-success/[0.08]");
    expect(screen.getByText("Ready to merge")).toHaveClass("text-success", "font-medium");
    expect(banner.querySelector('[data-icon="CircleCheck"]')).not.toBeNull();
  });
});
