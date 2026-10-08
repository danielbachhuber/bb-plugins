// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SyncStatus, syncedAgo } from "./sync-status";

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const MINUTE = 60_000;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("syncedAgo", () => {
  it("rounds down to the largest whole unit", () => {
    expect(syncedAgo(NOW - 20_000, NOW)).toBe("just now");
    expect(syncedAgo(NOW - 4 * MINUTE, NOW)).toBe("4m ago");
    expect(syncedAgo(NOW - 3 * 60 * MINUTE - 59 * MINUTE, NOW)).toBe("3h ago");
    expect(syncedAgo(NOW - 2 * 24 * 60 * MINUTE, NOW)).toBe("2d ago");
  });

  it("reads a sync stamped ahead of this clock as just now", () => {
    expect(syncedAgo(NOW + MINUTE, NOW)).toBe("just now");
  });
});

describe("SyncStatus", () => {
  it("says when nothing has synced yet", () => {
    render(<SyncStatus syncedAt={null} busy={false} onRefresh={() => {}} now={NOW} />);
    expect(screen.getByText("not synced yet")).toBeInTheDocument();
  });

  it("refreshes on click", () => {
    const onRefresh = vi.fn();
    render(<SyncStatus syncedAt={NOW - 4 * MINUTE} busy={false} onRefresh={onRefresh} now={NOW} />);
    expect(screen.getByText("synced 4m ago")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("disables the button while a refresh runs", () => {
    render(<SyncStatus syncedAt={NOW} busy onRefresh={() => {}} now={NOW} />);
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  });

  it("ages the label between syncs", async () => {
    vi.useFakeTimers({ now: NOW });
    render(<SyncStatus syncedAt={NOW} busy={false} onRefresh={() => {}} />);
    expect(screen.getByText("synced just now")).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(2 * MINUTE);
    expect(screen.getByText("synced 2m ago")).toBeInTheDocument();
  });
});
