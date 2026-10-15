// A thread's view as a compact list right above the composer. Each row is one
// item: its title, badges, one line of summary, and a Review button. Clicking
// the row opens the item in the side panel with everything else, or goes to the
// thread the item is worked in when it has one elsewhere. A view with
// the "list" layout lives in the side panel instead, so here it is one row
// that previews it and opens it. Kept free of RPC so a story can render it
// with fixture props.
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { closingItem, fillTally, openBeforeClosing, stepsBefore } from "./closing.js";
import { feedbackLabel } from "./review.js";
import { isQuiet, threadElsewhere, type Item } from "./schema.js";
import type { StoredView } from "./store.js";
import { MeterBar, TONE_CLASS } from "./view-panel.js";

export interface ViewBannerProps {
  stored: StoredView;
  collapsed: boolean;
  onToggle: () => void;
  /** Dismisses the view: hides it from above the composer until the thread publishes again. */
  onHide: () => void;
  /** Which item has an action in flight. */
  busyItem: string | null;
  /** The item the side panel shows, highlighted here. */
  focusedItem: string | null;
  onOpenItem: (item: Item) => void;
  onGoToThread: (threadId: string) => void;
  /** Opens a "list" layout view in the side panel. */
  onOpenView: () => void;
  /** The thread showing the list. An item worked in another thread opens that thread instead of the side panel. */
  currentThreadId?: string;
}

/** One line of plain text from a markdown summary, for the row. */
export function firstLine(markdown: string): string {
  const line = markdown.split("\n").find((l) => l.trim() !== "") ?? "";
  return line
    .replace(/^\s*(?:[-*+]|\d+\.|>)\s*/, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

/** Open items in the order published, then done or dismissed ones, so what is left stays at the top. */
export function orderItems(stored: StoredView): Item[] {
  const items = stored.view.sections.flatMap((section) => section.items);
  const isOpen = (item: Item) => (stored.items[item.id]?.state ?? "open") === "open";
  return [...items.filter(isOpen), ...items.filter((item) => !isOpen(item))];
}

/**
 * The rows above the composer, grouped by section when the view titles any
 * of them. Sections are optional: a view with no titles is one untitled
 * group, as before. Within each group, open items come first. The closing
 * step is drawn under the rows instead, so it is in no group.
 */
export function rowGroups(stored: StoredView): Array<{ title: string; items: Item[] }> {
  const isOpen = (item: Item) => (stored.items[item.id]?.state ?? "open") === "open";
  const steps = (items: Item[]) => items.filter((item) => !item.closing);
  if (stored.view.sections.every((section) => section.title === "")) {
    return [{ title: "", items: steps(orderItems(stored)) }];
  }
  return stored.view.sections
    .map((section) => {
      const items = steps(section.items);
      return { title: section.title, items: [...items.filter(isOpen), ...items.filter((item) => !isOpen(item))] };
    })
    .filter((group) => group.items.length > 0);
}

/** The items with a decision on them: every one but a list view's plain rows. */
export function decisionItems(stored: StoredView): Item[] {
  return stored.view.sections.flatMap((section) => section.items.filter((item) => !isQuiet(stored.view, item)));
}

/** Every item with a decision is done or dismissed. A view with none has nothing to finish. */
export function allHandled(stored: StoredView): boolean {
  const items = decisionItems(stored);
  return items.length > 0 && items.every((item) => (stored.items[item.id]?.state ?? "open") !== "open");
}

/**
 * The count beside the view's title. Once any item has an agent-set status,
 * the view is a piece of work in progress, so it counts what is complete;
 * otherwise it counts what is left to decide.
 */
export function progressLabel(stored: StoredView): string {
  // The closing step is what the count leads up to, not one of the things counted.
  const items = (stored.view.layout === "list" ? decisionItems(stored) : orderItems(stored)).filter((item) => !item.closing);
  if (items.length === 0) return "nothing to decide";
  const state = (item: Item) => stored.items[item.id]?.state ?? "open";
  if (items.some((item) => item.status !== undefined)) {
    return `${items.filter((item) => state(item) === "done").length} of ${items.length} complete`;
  }
  const open = items.filter((item) => state(item) === "open").length;
  return open === 0 ? `all ${items.length} handled` : `${open} of ${items.length} open`;
}

/**
 * A "list" layout view's one row above the composer: what is left to decide,
 * and under it what is on the list, each as names. The whole list is in the
 * side panel.
 */
export function listPreview(stored: StoredView): { deciding: string[]; listed: string[] } {
  const items = stored.view.sections.flatMap((section) => section.items);
  const state = (item: Item) => stored.items[item.id]?.state ?? "open";
  // What was added, as it was sent; what is left, as the skill wrote it.
  const name = (item: Item) => stored.items[item.id]?.result?.draft ?? (item.draft || item.title);
  return {
    deciding: items.filter((item) => !isQuiet(stored.view, item) && state(item) === "open").map(name),
    listed: items.filter((item) => isQuiet(stored.view, item) || state(item) === "done").map(name),
  };
}

function ListRow({ stored, onOpen }: { stored: StoredView; onOpen: () => void }) {
  const { deciding, listed } = listPreview(stored);
  return (
    <ul className="border-t border-border">
      <li className="flex items-center gap-2 px-3 py-1.5">
        <span className={cn("w-3 shrink-0 text-center text-xs", deciding.length === 0 ? "text-success" : "text-muted-foreground")} aria-hidden>
          {deciding.length === 0 ? "✓" : "○"}
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen} title="Open in the side panel">
          <span className="block truncate text-sm text-foreground">{deciding.length === 0 ? "Nothing left to decide" : deciding.join(", ")}</span>
          {listed.length === 0 ? null : (
            <span className="block truncate text-xs text-muted-foreground">On the list: {listed.join(", ")}</span>
          )}
        </button>
        <Button size="sm" variant={deciding.length === 0 ? "ghost" : "default"} className="h-6 shrink-0 px-2 text-xs" onClick={onOpen}>
          Review
        </Button>
      </li>
    </ul>
  );
}

export function ViewBanner({
  stored,
  collapsed,
  onToggle,
  onHide,
  busyItem,
  focusedItem,
  onOpenItem,
  onGoToThread,
  onOpenView,
  currentThreadId,
}: ViewBannerProps) {
  const list = stored.view.layout === "list";
  const closing = list ? undefined : closingItem(stored);

  return (
    <div>
      <div className="flex items-center pr-1.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left" onClick={onToggle} aria-expanded={!collapsed}>
          <span className="text-xs text-muted-foreground">{collapsed ? "▸" : "▾"}</span>
          <span className="min-w-0 flex-1 truncate text-sm">
            <b className="font-medium text-foreground">{stored.view.title}</b>
            <span className="text-muted-foreground"> · {progressLabel(stored)}</span>
          </span>
        </button>
        <button
          type="button"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground"
          onClick={onHide}
          aria-label="Dismiss"
          title="Dismiss: hide until this thread publishes again"
        >
          <Icon name="Archive" className="size-4" />
        </button>
      </div>
      {collapsed ? null : list ? (
        <ListRow stored={stored} onOpen={onOpenView} />
      ) : (
        <ul className="max-h-72 overflow-y-auto border-t border-border">
          {rowGroups(stored).map((group, g) => [
            group.title === "" ? null : (
              <li
                key={`section-${g}`}
                className="border-b border-border bg-muted/40 px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {group.title}
              </li>
            ),
            ...group.items.map((item) => {
            const record = stored.items[item.id];
            const state = record?.state ?? "open";
            const result = record?.result;
            const failed = result?.error !== undefined || (result?.exitCode !== undefined && result.exitCode !== 0);
            const summary = firstLine(item.summary);
            const elsewhere = threadElsewhere(item, currentThreadId);
            const open = () => (elsewhere === null ? onOpenItem(item) : onGoToThread(elsewhere));
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-2 border-b border-border px-3 py-1.5 last:border-0",
                  focusedItem === item.id && "bg-state-active",
                  state === "dismissed" && "opacity-50",
                )}
              >
                <span
                  className={cn("w-3 shrink-0 text-center text-xs", failed ? "text-destructive" : state === "done" ? "text-success" : "text-muted-foreground")}
                  aria-hidden
                >
                  {failed ? "!" : state === "done" ? "✓" : state === "dismissed" ? "–" : "○"}
                </span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={open} title={elsewhere === null ? "Open in the side panel" : "Open its thread"}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm text-foreground">{item.title}</span>
                    {item.status === undefined ? null : (
                      <span className={cn("shrink-0 rounded border px-1 text-[10px]", TONE_CLASS[item.status.tone])}>{item.status.label}</span>
                    )}
                    {item.badges.slice(0, 2).map((badge) => (
                      <span key={badge.label} className={cn("shrink-0 rounded border px-1 text-[10px]", TONE_CLASS[badge.tone])}>
                        {badge.label}
                      </span>
                    ))}
                    {item.meter === undefined ? null : (
                      <span className="ml-auto">
                        <MeterBar meter={item.meter} />
                      </span>
                    )}
                  </span>
                  {failed || state !== "open" || summary ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {failed
                        ? `${result!.label} failed`
                        : state === "done" && result?.feedback
                          ? feedbackLabel(item, result.feedback)
                          : state === "done" && result && item.status === undefined
                            ? result.label
                            : summary}
                    </span>
                  ) : null}
                </button>
                {elsewhere !== null ? (
                  <Button size="sm" variant={state === "open" ? "default" : "ghost"} className="h-6 shrink-0 px-2 text-xs" onClick={open}>
                    <Icon name="SideChat" aria-hidden />
                    Open thread
                  </Button>
                ) : state !== "open" ? (
                  result?.threadId ? (
                    <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-xs" onClick={() => onGoToThread(result.threadId!)}>
                      Go to thread
                    </Button>
                  ) : null
                ) : (
                  // Always opens the item: nothing runs from the list, so every
                  // action is taken with its details, draft, or command in view.
                  <Button
                    size="sm"
                    variant="default"
                    className="h-6 shrink-0 px-2 text-xs"
                    disabled={busyItem === item.id}
                    onClick={() => onOpenItem(item)}
                  >
                    {busyItem === item.id ? "Working…" : "Review"}
                  </Button>
                )}
              </li>
            );
            }),
          ])}
        </ul>
      )}
      {collapsed || closing === undefined ? null : (
        <ClosingRow stored={stored} item={closing} focused={focusedItem === closing.id} onOpen={() => onOpenItem(closing)} />
      )}
    </div>
  );
}

/**
 * The closing step under the rows: what it is, and either how many items are
 * left before it or what was done with them. Muted until it is ready.
 */
function ClosingRow({ stored, item, focused, onOpen }: { stored: StoredView; item: Item; focused: boolean; onOpen: () => void }) {
  const state = stored.items[item.id]?.state ?? "open";
  const left = openBeforeClosing(stored);
  const ready = left === 0;
  const before = stepsBefore(stored).length;
  return (
    <div className={cn("flex items-center gap-2 border-t border-border px-3 py-1.5", focused && "bg-state-active")}>
      <span className={cn("w-3 shrink-0 text-center text-xs", state === "done" ? "text-success" : "text-muted-foreground")} aria-hidden>
        {state === "done" ? "✓" : "→"}
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen} title="Open in the side panel">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Then</span>
          <span className={cn("truncate text-sm", ready && state === "open" ? "text-foreground" : "text-muted-foreground")}>{item.title}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {state === "done"
            ? (stored.items[item.id]?.result?.label ?? "Done")
            : ready
              ? fillTally(firstLine(item.summary) || "Everything above is handled.", stored)
              : `After the ${left} of ${before} still open above`}
        </span>
      </button>
      {state !== "open" ? null : (
        <Button size="sm" variant={ready ? "default" : "outline"} className="h-6 shrink-0 px-2 text-xs" onClick={onOpen}>
          Review
        </Button>
      )}
    </div>
  );
}
