import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago the last sync landed, in the header's own budget.
 *
 * Relative rather than a clock time: "synced 4m ago" answers the question the
 * header is there for — is this page current — where "Last synced 5:57:16 AM"
 * makes you do the subtraction, and does not fit beside a button anyway.
 */
export function syncedAgo(syncedAt: number, now: number): string {
  const elapsed = Math.max(0, now - syncedAt);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  return `${Math.floor(elapsed / DAY)}d ago`;
}

/** How often the label re-reads the clock. See the comment in SyncStatus. */
const TICK_MS = 30_000;

// What a plugin's vendored Button draws for variant="outline" size="sm". The
// SDK exports no Button, and this package cannot import a plugin's, so the
// classes are copied; keep them in step with components/ui/button.tsx.
const OUTLINE_SM_BUTTON =
  "inline-flex h-8 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-xs font-medium transition-colors duration-150 hover:bg-state-hover hover:text-foreground hover:duration-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

/**
 * The page's freshness and its refresh control, for a panel's title bar.
 *
 * Presentation only. Each plugin wires its own listing hook and refresh call
 * in a SyncHeader, because the contract and realtime channel differ per
 * plugin, but they all read identically in the title bar.
 */
export function SyncStatus({
  syncedAt,
  busy,
  onRefresh,
  now: fixedNow,
}: {
  syncedAt: number | null;
  busy: boolean;
  onRefresh: () => void;
  /** Pins the clock, for stories and tests. Omit it in a plugin. */
  now?: number;
}) {
  // The label ages on its own, so it has to re-read the clock rather than wait
  // for the next sync. Without this it would sit on "just now" for the whole
  // sync interval and then jump.
  const [tickedNow, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow !== undefined) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [fixedNow]);
  const now = fixedNow ?? tickedNow;

  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {syncedAt === null ? "not synced yet" : `synced ${syncedAgo(syncedAt, now)}`}
      </span>
      <button type="button" className={OUTLINE_SM_BUTTON} disabled={busy} onClick={onRefresh}>
        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} aria-hidden="true" data-icon="ArrowReloadHorizontal" />
        {busy ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
