// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SyncStatus, syncedAgo, type SyncUsage } from "./sync-status";

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

describe("SyncStatus with usage", () => {
  const usage: SyncUsage = {
    syncs: [
      { at: NOW - 13 * MINUTE, points: 102, calls: 5, ms: 6_800 },
      { at: NOW - 8 * MINUTE, points: null, calls: 5, ms: 6_100 },
      { at: NOW - 3 * MINUTE, points: 98, calls: 5, ms: 6_400 },
    ],
    budget: { used: 2_602, limit: 5_000, resetAt: NOW + 9 * MINUTE },
  };

  it("keeps the plain label without usage", () => {
    render(<SyncStatus syncedAt={NOW - 3 * MINUTE} busy={false} onRefresh={() => {}} now={NOW} />);
    expect(screen.queryByRole("button", { name: /synced 3m ago/ })).toBeNull();
  });

  it("opens the hour's points from the label", () => {
    render(<SyncStatus syncedAt={NOW - 3 * MINUTE} busy={false} onRefresh={() => {}} usage={usage} now={NOW} />);
    fireEvent.click(screen.getByRole("button", { name: /synced 3m ago/ }));
    expect(screen.getByText(/GitHub points over/).parentElement).toHaveTextContent(/^200GitHub points/);
    expect(screen.getByText(/over 3 syncs in the past hour/)).toBeInTheDocument();
    expect(screen.getByText(/not counting 1 sync that couldn't be measured/)).toBeInTheDocument();
    expect(screen.getByText("2,398")).toBeInTheDocument();
    expect(screen.getByText(/resets in 9 min/)).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    render(<SyncStatus syncedAt={NOW} busy={false} onRefresh={() => {}} usage={usage} now={NOW} defaultOpen />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText(/in the past hour/)).toBeNull();
  });

  it("says so when nothing synced in the hour, and drops a budget past its reset", () => {
    render(
      <SyncStatus
        syncedAt={null}
        busy={false}
        onRefresh={() => {}}
        usage={{ syncs: [], budget: { used: 10, limit: 5_000, resetAt: NOW - MINUTE } }}
        now={NOW}
        defaultOpen
      />,
    );
    expect(screen.getByText("No syncs in the past hour.")).toBeInTheDocument();
    expect(screen.queryByText(/points an hour for your account/)).toBeNull();
  });
});
