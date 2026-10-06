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

  it("draws an info banner in blue with an info icon", () => {
    render(<StatusBanner tone="info">Asked to review again</StatusBanner>);
    const banner = screen.getByText("Asked to review again").closest("[data-tone]")!;
    expect(banner).toHaveAttribute("data-tone", "info");
    expect(banner).toHaveClass("bg-[#0b57d0]/[0.07]");
    expect(screen.getByText("Asked to review again")).toHaveClass("text-[#0b57d0]", "font-medium");
    expect(banner.querySelector('[data-icon="Info"]')).not.toBeNull();
  });

  it("draws a detail after the status, lighter and not bold", () => {
    render(
      <StatusBanner tone="blocked" detail="hubber requested changes">
        Merge conflict with main
      </StatusBanner>,
    );
    const detail = screen.getByText(/hubber requested changes/);
    expect(detail).toHaveClass("font-normal", "text-destructive-text/80");
    expect(detail.closest("[data-tone]")).toHaveTextContent("Merge conflict with main · hubber requested changes");
  });

  it("draws a muted banner in grey for a problem set aside", () => {
    render(<StatusBanner tone="muted">Failing checks dismissed</StatusBanner>);
    const banner = screen.getByText("Failing checks dismissed").closest("[data-tone]")!;
    expect(banner).toHaveAttribute("data-tone", "muted");
    expect(banner).toHaveClass("bg-muted");
  });

  it("draws an action at the right end", () => {
    render(
      <StatusBanner tone="blocked" action={<button type="button">Dismiss</button>}>
        1 of 1 checks failing
      </StatusBanner>,
    );
    expect(screen.getByRole("button", { name: "Dismiss" }).parentElement).toHaveClass("ml-auto");
  });
});
