import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";

import { cn } from "../lib/cn";
import { CHART_WIDTH, SyncUsageSummary, type SyncUsage } from "./sync-usage";

export type { SyncUsage } from "./sync-usage";

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

/** The summary's width, and the least room it keeps from the window's edge. */
const SUMMARY_WIDTH = 400;
const EDGE = 8;

/**
 * The part of the window an element can draw in: the window, narrowed by
 * every ancestor that clips its overflow.
 */
function visibleBounds(element: HTMLElement): { left: number; right: number } {
  let left = 0;
  let right = window.innerWidth;
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX === "visible" && !style.contain.includes("paint")) continue;
    const rect = node.getBoundingClientRect();
    left = Math.max(left, rect.left);
    right = Math.min(right, rect.right);
  }
  return { left, right };
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
  usage,
  now: fixedNow,
  defaultOpen = false,
  initialHovered,
}: {
  syncedAt: number | null;
  busy: boolean;
  onRefresh: () => void;
  /** The past hour's GitHub cost. With it, the label opens a summary of it. */
  usage?: SyncUsage;
  /** Pins the clock, for stories and tests. Omit it in a plugin. */
  now?: number;
  /** Starts with the summary open, for a story. */
  defaultOpen?: boolean;
  /** A bar to show hovered, for a story. */
  initialHovered?: number;
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
  const label = syncedAt === null ? "not synced yet" : `synced ${syncedAgo(syncedAt, now)}`;

  const [open, setOpen] = useState(defaultOpen);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // Where the summary sits while open, relative to the label, kept inside
  // the page bb draws the plugin in. That page clips what overflows it, and
  // can be much narrower than the window: with Now's side panel open the
  // summary lost its left half, and with another panel beside the page, its
  // right. Measured once, on the click that opens it.
  const [place, setPlace] = useState<{ left: number; width: number } | null>(null);
  const toggle = () => {
    const box = root.current;
    const rect = trigger.current?.getBoundingClientRect();
    if (!open && box !== null && rect !== undefined) {
      const bounds = visibleBounds(box);
      const width = Math.min(SUMMARY_WIDTH, bounds.right - bounds.left - 2 * EDGE);
      const left = Math.min(Math.max(bounds.left + EDGE, rect.right - width), bounds.right - width - EDGE);
      setPlace({ left: left - box.getBoundingClientRect().left, width });
    }
    setOpen(!open);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-2">
      {usage === undefined ? (
        <span className="whitespace-nowrap text-xs text-muted-foreground">{label}</span>
      ) : (
        <div ref={root} className="relative">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${label}. Show what the syncs cost on GitHub.`}
            className="inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 hover:bg-state-hover hover:text-foreground hover:duration-0 aria-expanded:bg-state-hover aria-expanded:text-foreground"
            ref={trigger}
            onClick={toggle}
          >
            {label}
          </button>
          {open ? (
            <div
              data-slot="popover-content"
              className={cn(
                "absolute top-full z-50 mt-1 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md",
                place === null && "right-0",
              )}
              style={place === null ? { width: SUMMARY_WIDTH } : { width: place.width, left: place.left }}
            >
              <SyncUsageSummary
                usage={usage}
                now={now}
                initialHovered={initialHovered}
                // Less the summary's padding and border.
                chartWidth={Math.min(CHART_WIDTH, (place?.width ?? SUMMARY_WIDTH) - 34)}
              />
            </div>
          ) : null}
        </div>
      )}
      <button type="button" className={OUTLINE_SM_BUTTON} disabled={busy} onClick={onRefresh}>
        <HugeiconsIcon icon={ArrowReloadHorizontalIcon} aria-hidden="true" data-icon="ArrowReloadHorizontal" />
        {busy ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
