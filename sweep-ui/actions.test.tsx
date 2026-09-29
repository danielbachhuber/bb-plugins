// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CopyLinkAction, LINE_ACTION } from "./actions";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CopyLinkAction", () => {
  it("copies through the plugin's own writer, then reads Copied for a moment", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => true);
    render(<CopyLinkAction text="Widget hinge squeaks (#12)" url="https://github.com/acme/widgets/issues/12" write={write} />);
    const button = screen.getByRole("button", { name: "Copy link" });
    expect(button.className).toBe(LINE_ACTION);

    await act(async () => {
      fireEvent.click(button);
    });
    expect(write).toHaveBeenCalledWith("Widget hinge squeaks (#12)", "https://github.com/acme/widgets/issues/12");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });

  it("keeps its label when the write fails", async () => {
    const write = vi.fn(async () => false);
    render(<CopyLinkAction text="Widget hinge squeaks (#12)" url="https://github.com/acme/widgets/issues/12" write={write} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    });
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
  });
});
