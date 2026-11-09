// One list per tab: Now rows open, Next rows closed to their number line, and
// Later rows one line each, folded after a few. The summary squares above it
// narrow the list to one run.
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { Icon } from "./icons";
import { SweepRow, SweepStackLine, type SweepLinkProps } from "./row";
import { SummarySquares } from "./summary";
import type { Run, Stage, SweepItem, SweepStack, Tier } from "./types";

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
   * and no column for one. "later" keeps Now and Next rows open that way, and
   * draws Later rows as one closed line each with a chevron to open them.
   * Defaults to true: Now rows open, the rest closed.
   */
  collapsible?: boolean | "later";
  /** Drawn at the right end of an open row's action line, such as a timer. */
  renderTrailing?: (item: SweepItem) => ReactNode;
  /** Drawn on the title line right after the number, such as a pull request's stack button. */
  renderAfterNumber?: (item: SweepItem) => ReactNode;
  /** Drawn directly under a row's action line: component-library's ThreadLine for a row with a thread. */
  renderThreadLine?: (item: SweepItem) => ReactNode;
  /**
   * Drawn directly under a row's action line, above its thread line: the
   * Start thread box, for the row whose button opened it. Null for the rest.
   */
  renderStartThread?: (item: SweepItem) => ReactNode;
  /**
   * The drawer the comment count opens, under the action line. Without it the
   * count is only a number. Drawn only while open, so a drawer that loads its
   * comments loads them on the click.
   */
  renderComments?: (item: SweepItem) => ReactNode;
  /**
   * "tier", the default, draws Now, then Next, then Later, folding Later after
   * `laterShown`. "given" draws the rows in the order `items` has them, with
   * nothing folded, for a caller that orders them itself.
   */
  order?: "tier" | "given";
  /** Drawn on the summary squares' line, at its right end, such as a button acting on the list. */
  summaryAction?: ReactNode;
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
  renderAfterNumber,
  renderThreadLine,
  renderStartThread,
  renderComments,
  order = "tier",
  summaryAction,
}: SweepListProps) {
  const [filter, setFilter] = useState<string | null>(null);
  // Rows opened or closed by hand. Open state lives only as long as the panel.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [showAllLater, setShowAllLater] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState<ReadonlySet<string>>(new Set());

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
  // Each row, or each stack of two or more rows, in the order drawn. A stack
  // takes the place of its first row and draws its rows bottom first.
  const sequence = order === "given" ? shown : [...now, ...next, ...later];
  const blocks = groupStacks(sequence);
  const tierOfBlock = (block: Block) => tierOf.get(firstOf(block).runId) ?? "later";
  // A filtered list is short already, so its Later rows all show.
  const laterBlocks = blocks.filter((block) => tierOfBlock(block) === "later");
  const fold = order === "tier" && active === null && !showAllLater && laterBlocks.length > laterShown;
  const hidden = fold ? new Set(laterBlocks.slice(laterShown)) : new Set<Block>();
  const hiddenRows = [...hidden].reduce((count, block) => count + rowsOf(block).length, 0);

  const commentsProps = (item: SweepItem) => ({
    onToggleComments: renderComments
      ? () =>
          setCommentsOpen((current) => {
            const next = new Set(current);
            if (!next.delete(item.key)) next.add(item.key);
            return next;
          })
      : undefined,
    commentsOpen: commentsOpen.has(item.key),
    commentsDrawer: renderComments && commentsOpen.has(item.key) ? renderComments(item) : undefined,
  });
  const noteProps = (item: SweepItem) => ({
    editing: editing === item.key,
    onEditNote: () => setEditing(item.key),
    onNoteSave: async (body: string) => {
      const saved = await onNoteSave(item, body);
      if (saved) setEditing((current) => (current === item.key ? null : current));
      return saved;
    },
    onNoteCancel: () => setEditing(null),
  });

  const rowFor = (item: SweepItem, tier: Tier) => {
    const closable = collapsible === true || (collapsible === "later" && tier === "later");
    const open = !closable || item.forceOpen === true || (toggled[item.key] ?? tier === "now");
    return (
      <SweepRow
        key={item.key}
        item={item}
        tier={tier}
        open={open}
        onToggle={!closable || item.forceOpen ? undefined : () => setToggled((current) => ({ ...current, [item.key]: !open }))}
        chevron={closable}
        tone={toneOf.get(item.runId)}
        stages={stages}
        onMove={onMove ? (stage) => onMove(item, stage) : undefined}
        onOpenLink={onOpenLink ? () => onOpenLink(item) : undefined}
        Link={Link}
        actions={renderActions(item)}
        trailing={renderTrailing?.(item)}
        afterNumber={renderAfterNumber?.(item)}
        threadLine={renderThreadLine?.(item)}
        startThread={renderStartThread?.(item)}
        {...commentsProps(item)}
        {...noteProps(item)}
        busy={busyKeys?.has(item.key) ?? false}
        renderBody={renderBody}
        renderTrack={renderTrack}
      />
    );
  };

  const stackFor = (stack: SweepStack, rows: SweepItem[]) => (
    <li key={`stack:${stack.key}`} className="py-3" data-part="stack">
      <StackHeader stack={stack} />
      <ul className="mt-1.5 divide-y divide-border overflow-hidden rounded-md border border-border">
        {rows.map((item) => (
          <SweepStackLine
            key={item.key}
            item={item}
            tone={toneOf.get(item.runId)}
            onOpenLink={onOpenLink ? () => onOpenLink(item) : undefined}
            Link={Link}
            actions={renderActions(item)}
            trailing={renderTrailing?.(item)}
            renderBody={renderBody}
            threadLine={renderThreadLine?.(item)}
            startThread={renderStartThread?.(item)}
            {...commentsProps(item)}
            {...noteProps(item)}
            busy={busyKeys?.has(item.key) ?? false}
          />
        ))}
      </ul>
    </li>
  );

  return (
    <div className="space-y-3">
      {summaryAction ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <SummarySquares runs={runs} items={items} value={active} onChange={setFilter} />
          </div>
          <div className="shrink-0">{summaryAction}</div>
        </div>
      ) : (
        <SummarySquares runs={runs} items={items} value={active} onChange={setFilter} />
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
        {blocks
          .filter((block) => !hidden.has(block))
          .map((block) => ("stack" in block ? stackFor(block.stack, block.rows) : rowFor(block.item, tierOfBlock(block))))}
        {fold ? (
          <li>
            <button
              type="button"
              onClick={() => setShowAllLater(true)}
              className="flex w-full items-center gap-1.5 py-2 pl-8 text-left text-xs text-muted-foreground hover:text-foreground"
            >
              <Icon name="ChevronDown" className="size-3" />
              {hiddenRows} more
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

type Block = { item: SweepItem } | { stack: SweepStack; rows: SweepItem[] };

const firstOf = (block: Block): SweepItem => ("stack" in block ? block.rows[0]! : block.item);
const rowsOf = (block: Block): SweepItem[] => ("stack" in block ? block.rows : [block.item]);

/**
 * The rows in order, with each stack that has two or more rows here gathered
 * into one block where its first row was, bottom of the stack first. A stack
 * with one row here stays a row.
 */
export function groupStacks(items: SweepItem[]): Block[] {
  const members = new Map<string, SweepItem[]>();
  for (const item of items) {
    if (!item.stack) continue;
    const list = members.get(item.stack.key) ?? [];
    list.push(item);
    members.set(item.stack.key, list);
  }
  const placed = new Set<string>();
  const blocks: Block[] = [];
  for (const item of items) {
    const rows = item.stack ? members.get(item.stack.key) : undefined;
    if (!item.stack || !rows || rows.length < 2) {
      blocks.push({ item });
      continue;
    }
    if (placed.has(item.stack.key)) continue;
    placed.add(item.stack.key);
    blocks.push({ stack: item.stack, rows: [...rows].sort((a, b) => a.stack!.position - b.stack!.position) });
  }
  return blocks;
}

/** "Stack #731 · 4 open · #690, #694 merged". */
function StackHeader({ stack }: { stack: SweepStack }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon name="Layers" className="size-3.5" />
      <span className="font-medium text-foreground">Stack #{stack.number}</span>
      <span>· {stack.open} open</span>
      {stack.merged.length > 0 ? <span>· {stack.merged.map((number) => `#${number}`).join(", ")} merged</span> : null}
    </div>
  );
}
