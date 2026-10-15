// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";

const sidebar = { status: "ready", threads: [] as unknown[], projects: [] };
vi.mock("@get-bb/plugin-sdk/app", () => ({ experimental_useSidebarThreads: () => sidebar }));

const { ThreadLine, OpenThreadAction, liveOf, useThreadStatus } = await import("./thread-status");

afterEach(cleanup);

describe("liveOf", () => {
  it("folds bb's sidebar indicators into the five states a row shows", () => {
    const of = (indicator: string, hasPendingInteraction = false) =>
      liveOf({ indicator: indicator as never, hasPendingInteraction });
    expect(of("runtime")).toBe("working");
    expect(of("workflow")).toBe("working");
    expect(of("background-agent")).toBe("working");
    expect(of("waiting-for-input")).toBe("needs-you");
    expect(of("unread-success")).toBe("done");
    expect(of("unread-error")).toBe("failed");
    expect(of("none")).toBe("idle");
    // An approval or question outranks whatever else the thread is doing.
    expect(of("runtime", true)).toBe("needs-you");
  });
});

describe("useThreadStatus", () => {
  it("reads a thread's title and state from the sidebar, and null for one it does not list", () => {
    sidebar.threads = [
      { id: "thr_1", title: null, titleFallback: "Fix the widget export", indicator: "waiting-for-input", hasPendingInteraction: false },
    ];
    const { result } = renderHook(() => useThreadStatus());
    expect(result.current("thr_1")).toEqual({ id: "thr_1", title: "Fix the widget export", live: "needs-you" });
    expect(result.current("thr_archived")).toBeNull();
    expect(result.current(null)).toBeNull();
  });
});

describe("ThreadLine", () => {
  it("says what the thread is doing and opens it", () => {
    const onOpen = vi.fn();
    render(<ThreadLine status={{ id: "thr_1", title: "Fix the widget export", live: "working" }} onOpen={onOpen} />);
    const band = screen.getByRole("button");
    expect(band.textContent).toContain("Working");
    expect(band.textContent).toContain("Fix the widget export");
    fireEvent.click(band);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("still opens the thread when the sidebar has no status for it", () => {
    const onOpen = vi.fn();
    render(<ThreadLine status={null} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Thread/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});

describe("OpenThreadAction", () => {
  it("is the row's Open thread action", () => {
    const onOpen = vi.fn();
    render(<OpenThreadAction onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Open thread" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
