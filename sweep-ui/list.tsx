// One list per tab: Now rows open, Next rows closed to their number line, and
// Later rows one line each, folded after a few. The summary squares above it
// narrow the list to one run.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { Icon } from "./icons";
import { SweepRow, type SweepLinkProps } from "./row";
import { SummarySquares } from "./summary";
import type { Run, Stage, SweepItem, Tier } from "./types";

export type { SweepLinkProps };

export interface SweepListProps {
  stages: Stage[];
  /** In list order; each item's tier comes from its run. */
  runs: Run[];
  /** Already sorted by the caller. */
  items: SweepItem[];
  /** The action line's contents, drawn before the list's own note button. */
  renderActions: (item: SweepItem) => ReactNode;
  /** Makes the track's dots clickable. */
  onMove?: (item: SweepItem, stage: number) => void;
  /** "" deletes the note. Resolves true once saved, which closes the field. */
  onNoteSave: (item: SweepItem, body: string) => Promise<boolean>;
  /** Called when the title is clicked, before the link opens. */
  onOpenLink?: (item: SweepItem) => void;
  /**
   * Draws the title and parent chip. Plugins pass the SDK's `UrlLink` so links
   * open the way every other bb link does; defaults to a plain anchor.
   */
  Link?: ComponentType<SweepLinkProps>;
  /** Later rows shown before "N more". */
  laterShown?: number;
  /** Rows dimmed while a request for them runs. */
  busyKeys?: ReadonlySet<string>;
  /**
   * Draws the row's body under its title line, in place of the number line:
   * the title line keeps the icon, title, number, "N new", and the first fact
   * as the age, and an open row adds the note and actions after the body. On a
   * one-line Later row it is drawn inline, with `line` true, where the first
   * fact would be. Without it, rows draw their number line.
   */
  renderBody?: (item: SweepItem, open: boolean, line: boolean) => ReactNode;
  /**
   * Draws the right-hand column in place of the stage track. Returning null
   * leaves the column out, so the row takes the full width.
   */
  renderTrack?: (item: SweepItem, line: boolean) => ReactNode;
  /**
   * False keeps every row open, whatever its tier, with no chevron to close it
   * and no column for one. Defaults to true: Now rows open, the rest closed.
   */
  collapsible?: boolean;
  /** Drawn at the right end of an open row's action line, such as a timer. */
  renderTrailing?: (item: SweepItem) => ReactNode;
}

const TIERS: Tier[] = ["now", "next", "later"];

export function SweepList({
  stages,
  runs,
  items,
  renderActions,
  onMove,
  onNoteSave,
  onOpenLink,
  Link,
  laterShown = 5,
  busyKeys,
  renderBody,
  renderTrack,
  collapsible = true,
  renderTrailing,
}: SweepListProps) {
  const [filter, setFilter] = useState<string | null>(null);
  // Rows opened or closed by hand. Open state lives only as long as the panel.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [showAllLater, setShowAllLater] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // A sync can empty the chosen run. Then the filter would hide every row, so
  // it clears. The check below also covers the render before this runs.
  const filterHasRows = filter !== null && items.some((item) => item.runId === filter);
  useEffect(() => {
    if (filter !== null && !filterHasRows) setFilter(null);
  }, [filter, filterHasRows]);
  const active = filterHasRows ? filter : null;

  if (items.length === 0) return null;

  const tierOf = new Map(runs.map((run) => [run.id, run.tier]));
  const toneOf = new Map(runs.map((run) => [run.id, run.tone]));
  const shown = active === null ? items : items.filter((item) => item.runId === active);
  // Stable by tier, so a caller that sorts within tiers gets Now, Next, Later.
  const byTier = TIERS.map((tier) => shown.filter((item) => (tierOf.get(item.runId) ?? "later") === tier));
  const [now, next, later] = byTier as [SweepItem[], SweepItem[], SweepItem[]];
  // A filtered list is short already, so its Later rows all show.
  const fold = active === null && !showAllLater && later.length > laterShown;
  const visibleLater = fold ? later.slice(0, laterShown) : later;

  const rowFor = (item: SweepItem, tier: Tier) => {
    const open = !collapsible || item.forceOpen === true || (toggled[item.key] ?? tier === "now");
    return (
      <SweepRow
        key={item.key}
        item={item}
        tier={tier}
        open={open}
        onToggle={!collapsible || item.forceOpen ? undefined : () => setToggled((current) => ({ ...current, [item.key]: !open }))}
        chevron={collapsible}
        tone={toneOf.get(item.runId)}
        stages={stages}
        onMove={onMove ? (stage) => onMove(item, stage) : undefined}
        onOpenLink={onOpenLink ? () => onOpenLink(item) : undefined}
        Link={Link}
        actions={renderActions(item)}
        trailing={renderTrailing?.(item)}
        editing={editing === item.key}
        onEditNote={() => setEditing(item.key)}
        onNoteSave={async (body) => {
          const saved = await onNoteSave(item, body);
          if (saved) setEditing((current) => (current === item.key ? null : current));
          return saved;
        }}
        onNoteCancel={() => setEditing(null)}
        busy={busyKeys?.has(item.key) ?? false}
        renderBody={renderBody}
        renderTrack={renderTrack}
      />
    );
  };

  return (
    <div className="space-y-3">
      <SummarySquares runs={runs} items={items} value={active} onChange={setFilter} />
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
        {now.map((item) => rowFor(item, "now"))}
        {next.map((item) => rowFor(item, "next"))}
        {visibleLater.map((item) => rowFor(item, "later"))}
        {fold ? (
          <li>
            <button
              type="button"
              onClick={() => setShowAllLater(true)}
              className="flex w-full items-center gap-1.5 py-2 pl-8 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              <Icon name="ChevronDown" className="size-3" />
              {later.length - laterShown} more
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
