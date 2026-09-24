// What a view's tab draws. Kept free of RPC so a story can render it with
// fixture props.
import { useState } from "react";
import { Markdown, UrlLink } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Action, Item } from "./schema.js";
import type { ItemRecord, StoredView } from "./store.js";

export interface ViewPanelProps {
  stored: StoredView;
  /** Which item has an action in flight. */
  busyItem: string | null;
  onRun: (item: Item, index: number) => void;
  onDismiss: (item: Item, dismissed: boolean) => void;
  onGoToThread: (threadId: string) => void;
  /** Items whose details start expanded. Stories use it; the panel does not. */
  expandedItems?: string[];
  /** An item whose command confirmation starts open, as `itemId:index`. Stories use it. */
  confirming?: string;
}

const TONE_CLASS: Record<string, string> = {
  neutral: "border-border text-muted-foreground",
  info: "border-border text-foreground",
  success: "border-success/40 text-success",
  warning: "border-warning/40 text-warning",
  danger: "border-destructive/40 text-destructive",
};

function Result({ record, onGo }: { record: ItemRecord; onGo: (id: string) => void }) {
  const result = record.result;
  if (result === null) return null;
  const failed = result.error !== undefined || (result.exitCode !== undefined && result.exitCode !== 0);
  return (
    <div className={cn("mt-2 rounded-md px-3 py-2 text-xs", failed ? "bg-destructive/10" : "bg-muted/40")}>
      <div className="text-muted-foreground">
        {result.label}
        {result.exitCode === undefined ? null : ` · exit ${result.exitCode}`}
        {result.threadId === undefined ? null : (
          <>
            {" · "}
            <button type="button" className="font-mono hover:text-foreground hover:underline" onClick={() => onGo(result.threadId!)}>
              {result.threadId}
            </button>
          </>
        )}
      </div>
      {result.error === undefined ? null : <div className="mt-1 text-destructive">{result.error}</div>}
      {result.output === undefined || result.output === "" ? null : (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-foreground">{result.output}</pre>
      )}
    </div>
  );
}

function ActionButton({
  action,
  openedThread,
  busy,
  onRun,
  onConfirm,
  onGo,
}: {
  action: Action;
  /** The thread this action already opened, so a second click does not open another. */
  openedThread: string | null;
  busy: boolean;
  onRun: () => void;
  onConfirm: () => void;
  onGo: (id: string) => void;
}) {
  const variant = action.primary ? "default" : "outline";
  if (openedThread !== null) {
    return (
      <Button size="sm" variant="outline" onClick={() => onGo(openedThread)}>
        Go to thread
      </Button>
    );
  }
  if (action.type === "link") {
    return (
      <Button size="sm" variant={variant} asChild>
        <UrlLink href={action.url}>{action.label}</UrlLink>
      </Button>
    );
  }
  return (
    <Button size="sm" variant={variant} disabled={busy} onClick={action.type === "command" ? onConfirm : onRun}>
      {action.label}
    </Button>
  );
}

function ItemCard({
  item,
  record,
  busy,
  initiallyExpanded,
  initiallyConfirming,
  onRun,
  onDismiss,
  onGo,
}: {
  item: Item;
  record: ItemRecord | undefined;
  busy: boolean;
  initiallyExpanded: boolean;
  initiallyConfirming: number | null;
  onRun: (index: number) => void;
  onDismiss: (dismissed: boolean) => void;
  onGo: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [confirming, setConfirming] = useState<number | null>(initiallyConfirming);
  const state = record?.state ?? "open";
  const pending = confirming === null ? null : item.actions[confirming];

  return (
    <li className={cn("rounded-lg border border-border bg-card px-4 py-3", state === "dismissed" && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">{item.title}</div>
          {item.badges.length === 0 && state !== "dismissed" ? null : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {/* A done item shows what happened in its result, not a tag. */}
              {state === "dismissed" ? (
                <span className="rounded border border-border px-1.5 py-px text-[11px] text-muted-foreground">
                  Dismissed
                </span>
              ) : null}
              {item.badges.map((badge) => (
                <span key={badge.label} className={cn("rounded border px-1.5 py-px text-[11px]", TONE_CLASS[badge.tone])}>
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {state === "dismissed" ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(false)}>
            Restore
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(true)}>
            Dismiss
          </Button>
        )}
      </div>

      {item.summary === "" ? null : (
        <div className="mt-2 text-sm">
          <Markdown content={item.summary} />
        </div>
      )}
      {item.details === "" ? null : (
        <>
          <Button size="sm" variant="link" className="mt-1 h-auto px-0 text-xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Hide details" : "Details"}
          </Button>
          {expanded ? (
            <div className="mt-1 rounded-md bg-muted/40 px-3 py-2 text-sm">
              <Markdown content={item.details} />
            </div>
          ) : null}
        </>
      )}

      {record === undefined ? null : <Result record={record} onGo={onGo} />}

      {pending !== undefined && pending !== null && pending.type === "command" ? (
        <div className="mt-3 rounded-md border border-border px-3 py-2">
          <div className="text-xs text-muted-foreground">Run this command{pending.cwd ? ` in ${pending.cwd}` : ""}?</div>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-foreground">{pending.command}</pre>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                onRun(confirming!);
                setConfirming(null);
              }}
            >
              Run
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : item.actions.length === 0 || state === "dismissed" ? null : (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.actions.map((action, index) => (
            <ActionButton
              key={`${action.type}:${action.label}`}
              action={action}
              openedThread={
                action.type === "thread" && record?.result?.label === action.label ? (record.result.threadId ?? null) : null
              }
              busy={busy}
              onRun={() => onRun(index)}
              onConfirm={() => setConfirming(index)}
              onGo={onGo}
            />
          ))}
          {busy ? <span className="self-center text-xs text-muted-foreground">Working…</span> : null}
        </div>
      )}
    </li>
  );
}

export function ViewPanel({ stored, busyItem, onRun, onDismiss, onGoToThread, expandedItems, confirming }: ViewPanelProps) {
  const { view } = stored;
  const all = view.sections.flatMap((section) => section.items);
  const open = all.filter((item) => (stored.items[item.id]?.state ?? "open") === "open").length;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <h1 className="text-base font-semibold text-foreground">{view.title}</h1>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {all.length} items, {open} open
          </div>
          {view.summary === "" ? null : (
            <div className="mt-2 text-sm">
              <Markdown content={view.summary} />
            </div>
          )}
        </div>
        {view.sections.map((section, s) => (
          <section key={`${s}:${section.title}`}>
            {section.title === "" ? null : (
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{section.title}</h2>
            )}
            <ol className="flex flex-col gap-2">
              {section.items.map((item) => {
                const [confirmItem, confirmIndex] = confirming?.split(":") ?? [];
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    record={stored.items[item.id]}
                    busy={busyItem === item.id}
                    initiallyExpanded={expandedItems?.includes(item.id) ?? false}
                    initiallyConfirming={confirmItem === item.id ? Number(confirmIndex) : null}
                    onRun={(index) => onRun(item, index)}
                    onDismiss={(dismissed) => onDismiss(item, dismissed)}
                    onGo={onGoToThread}
                  />
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
