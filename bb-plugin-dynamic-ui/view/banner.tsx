// A thread's view as a compact list right above the composer. Each row is one
// item: its title, badges, one line of summary, and its main button. Clicking
// the row opens the item in the side panel with everything else. Kept free of
// RPC so a story can render it with fixture props.
import { UrlLink } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usesDraft, type Action, type Item } from "./schema.js";
import type { StoredView } from "./store.js";
import { TONE_CLASS } from "./view-panel.js";

export interface ViewBannerProps {
  stored: StoredView;
  collapsed: boolean;
  onToggle: () => void;
  /** Which item has an action in flight. */
  busyItem: string | null;
  /** The item the side panel shows, highlighted here. */
  focusedItem: string | null;
  onOpenItem: (item: Item) => void;
  /** The row's main button. The app opens the item instead for a command or a draft. */
  onRun: (item: Item, index: number) => void;
  onGoToThread: (threadId: string) => void;
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

/** The button a row shows: the primary action, or the first one that is not a link. */
export function mainAction(item: Item): { action: Action; index: number } | null {
  const index = item.actions.findIndex((a) => a.primary);
  const chosen = index >= 0 ? index : item.actions.findIndex((a) => a.type !== "link");
  const at = chosen >= 0 ? chosen : 0;
  const action = item.actions[at];
  return action === undefined ? null : { action, index: at };
}

export function ViewBanner({
  stored,
  collapsed,
  onToggle,
  busyItem,
  focusedItem,
  onOpenItem,
  onRun,
  onGoToThread,
}: ViewBannerProps) {
  const items = stored.view.sections.flatMap((section) => section.items);
  const open = items.filter((item) => (stored.items[item.id]?.state ?? "open") === "open").length;

  return (
    <div>
      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={onToggle} aria-expanded={!collapsed}>
        <span className="text-xs text-muted-foreground">{collapsed ? "▸" : "▾"}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          <b className="font-medium text-foreground">{stored.view.title}</b>
          <span className="text-muted-foreground">
            {" "}
            · {open === 0 ? `all ${items.length} handled` : `${open} of ${items.length} open`}
          </span>
        </span>
      </button>
      {collapsed ? null : (
        <ul className="max-h-72 overflow-y-auto border-t border-border">
          {items.map((item) => {
            const record = stored.items[item.id];
            const state = record?.state ?? "open";
            const main = mainAction(item);
            const result = record?.result;
            const failed = result?.error !== undefined || (result?.exitCode !== undefined && result.exitCode !== 0);
            const summary = firstLine(item.summary);
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
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenItem(item)} title="Open in the side panel">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate text-sm text-foreground">{item.title}</span>
                    {item.badges.slice(0, 2).map((badge) => (
                      <span key={badge.label} className={cn("shrink-0 rounded border px-1 text-[10px]", TONE_CLASS[badge.tone])}>
                        {badge.label}
                      </span>
                    ))}
                  </span>
                  {failed || state !== "open" || summary ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {failed
                        ? `${result!.label} failed`
                        : state === "done" && result?.feedback
                          ? result.feedback.pick === null
                            ? "Feedback sent"
                            : `Picked ${item.variations[result.feedback.pick]?.label ?? "one"}`
                          : state === "done" && result
                            ? result.label
                            : summary}
                    </span>
                  ) : null}
                </button>
                {state !== "open" ? (
                  result?.threadId ? (
                    <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-xs" onClick={() => onGoToThread(result.threadId!)}>
                      Go to thread
                    </Button>
                  ) : null
                ) : item.variations.length > 0 ? (
                  <Button size="sm" variant="default" className="h-6 shrink-0 px-2 text-xs" onClick={() => onOpenItem(item)}>
                    Review…
                  </Button>
                ) : main === null ? null : main.action.type === "link" ? (
                  <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-xs" asChild>
                    <UrlLink href={main.action.url}>{main.action.label}</UrlLink>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={main.action.primary ? "default" : "outline"}
                    className="h-6 shrink-0 px-2 text-xs"
                    disabled={busyItem === item.id}
                    onClick={() => onRun(item, main.index)}
                  >
                    {busyItem === item.id
                      ? "Working…"
                      : // "…" marks a button that opens the item to show a command or a draft first.
                        `${main.action.label}${main.action.type === "command" || usesDraft(main.action) ? "…" : ""}`}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
