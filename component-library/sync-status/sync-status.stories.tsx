import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SyncStatus } from "./sync-status";

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
