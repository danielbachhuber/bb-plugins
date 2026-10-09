import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SyncStatus, type SyncUsage } from "./sync-status";

export default {
  title: "component-library/Sync status",
};

// Pinned so the labels, and the screenshots, do not change from run to run.
const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const MINUTE = 60_000;
const noop = () => {};

/**
 * Every label the control can show, from no sync yet to days old, and the
 * button while a refresh runs.
 */
export const States = () => (
  <StoryCard>
    <StoryRow label="Not synced yet" hint="Before the first sync finishes">
      <SyncStatus syncedAt={null} busy={false} onRefresh={noop} now={NOW} />
    </StoryRow>
    <StoryRow label="Just now" hint="Under a minute">
      <SyncStatus syncedAt={NOW - 20_000} busy={false} onRefresh={noop} now={NOW} />
    </StoryRow>
    <StoryRow label="Minutes">
      <SyncStatus syncedAt={NOW - 4 * MINUTE} busy={false} onRefresh={noop} now={NOW} />
    </StoryRow>
    <StoryRow label="Hours">
      <SyncStatus syncedAt={NOW - 3 * 60 * MINUTE} busy={false} onRefresh={noop} now={NOW} />
    </StoryRow>
    <StoryRow label="Days">
      <SyncStatus syncedAt={NOW - 2 * 24 * 60 * MINUTE} busy={false} onRefresh={noop} now={NOW} />
    </StoryRow>
    <StoryRow label="Refreshing" hint="Disabled until the refresh returns">
      <SyncStatus syncedAt={NOW - 4 * MINUTE} busy onRefresh={noop} now={NOW} />
    </StoryRow>
  </StoryCard>
);

/** Where the control goes: the right end of a page's title bar, across from its name. */
export const InATitleBar = () => (
  <div className="m-6 flex w-[36rem] flex-col rounded-lg border border-border bg-background">
    <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
      <span className="text-sm font-medium">Reviews</span>
      <SyncStatus syncedAt={NOW - 4 * MINUTE} busy={false} onRefresh={noop} now={NOW} />
    </div>
    <div className="h-24" />
  </div>
);

/** A sync every five minutes over the past hour, the newest three minutes ago. */
function hourOf(points: (index: number) => number | null, calls: number, ms: number): SyncUsage["syncs"] {
  return Array.from({ length: 12 }, (_, index) => ({
    at: NOW - 3 * MINUTE - (11 - index) * 5 * MINUTE,
    points: points(index),
    calls,
    ms,
  }));
}

const BUDGET = { used: 2_602, limit: 5_000, resetAt: NOW + 9 * MINUTE };

const EXPENSIVE: SyncUsage = {
  syncs: [
    ...hourOf((index) => [101, 98, 104, 102, 99, 103, 100, 102, 106, 101, 98, 102][index]!, 5, 6_600),
    // A Refresh between two scheduled syncs.
    { at: NOW - 20 * MINUTE, points: 102, calls: 5, ms: 7_100 },
  ].sort((a, b) => a.at - b.at),
  budget: BUDGET,
};

const CHEAP: SyncUsage = {
  syncs: hourOf((index) => [4, 4, 3, 4, 4, 5, 4, 4, 4, 3, 4, 4][index]!, 2, 1_200),
  budget: BUDGET,
};

const PATCHY: SyncUsage = {
  // Two syncs whose readings came from different counters, and a gap where bb was closed.
  syncs: hourOf((index) => (index === 4 || index === 9 ? null : 15), 4, 2_300).filter(
    (_, index) => index < 1 || index > 3,
  ),
  budget: BUDGET,
};

/**
 * Clicking the label opens what the past hour of syncs cost on GitHub: the
 * total, a bar per sync with one hovered, and what the account has left.
 * Here a panel spending about 100 points a sync, with one Refresh between
 * two scheduled syncs.
 */
export const Usage = () => (
  <div className="m-6 flex h-[30rem] w-[36rem] flex-col rounded-lg border border-border bg-background">
    <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
      <span className="text-sm font-medium">Pull requests</span>
      <SyncStatus
        syncedAt={NOW - 3 * MINUTE}
        busy={false}
        onRefresh={noop}
        usage={EXPENSIVE}
        now={NOW}
        defaultOpen
        initialHovered={8}
      />
    </div>
  </div>
);

/**
 * The summary for a cheap panel, for one with syncs that could not be
 * measured and a gap where none ran, and for an hour with no syncs.
 */
export const UsageStates = () => (
  <StoryCard>
    {(
      [
        ["About 4 points a sync", CHEAP],
        ["Two syncs not measured, and a gap", PATCHY],
        ["No syncs this hour", { syncs: [], budget: null }],
      ] as const
    ).map(([label, usage]) => (
      <StoryRow key={label} label={label}>
        <div className="flex h-[30rem] w-[30rem] items-start justify-end">
          <SyncStatus syncedAt={NOW - 3 * MINUTE} busy={false} onRefresh={noop} usage={usage} now={NOW} defaultOpen />
        </div>
      </StoryRow>
    ))}
  </StoryCard>
);
