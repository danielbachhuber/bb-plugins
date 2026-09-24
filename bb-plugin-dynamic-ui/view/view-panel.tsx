// What a view's tab draws. Kept free of RPC so a story can render it with
// fixture props.
import { useState } from "react";
import { Markdown, UrlLink } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usesDraft, type Action, type Item } from "./schema.js";
import type { ItemRecord, StoredView } from "./store.js";
import { DraftEditor } from "./draft-editor.js";
import type { Feedback } from "./review.js";
import { ReviewPanel } from "./review-panel.js";

export interface ViewPanelProps {
  stored: StoredView;
  /** Which item has an action in flight. */
  busyItem: string | null;
  /** `draft` is the item's draft as the user edited it; absent when unchanged. */
  onRun: (item: Item, index: number, draft?: string) => void;
  onDismiss: (item: Item, dismissed: boolean) => void;
  onGoToThread: (threadId: string) => void;
  /** An item whose command confirmation starts open, as `itemId:index`. */
  confirming?: string;
  /** The item picked in the list above the composer. None picked shows the first open item. */
  focusItemId?: string | null;
  /** Whether the draft starts rendered or as source. Preview unless a story says otherwise. */
  draftMode?: "preview" | "raw";
  /** A visual review's image as a URL; undefined while it loads. */
  imageUrl?: (itemId: string, index: number) => string | null | undefined;
  onSubmitReview?: (item: Item, feedback: Feedback) => void;
  /** A visual review's starting pick and notes, for a story. */
  reviewInitial?: Feedback;
}

export const TONE_CLASS: Record<string, string> = {
  neutral: "border-border text-muted-foreground",
  info: "border-border text-foreground",
  success: "border-success/40 text-success",
  warning: "border-warning/40 text-warning",
  danger: "border-destructive/40 text-destructive",
};

/** The item shown when none is picked: the first one still open, or null once all are handled. */
export function firstOpenItem(stored: StoredView): Item | null {
  for (const section of stored.view.sections) {
    for (const item of section.items) {
      if ((stored.items[item.id]?.state ?? "open") === "open") return item;
    }
  }
  return null;
}

/** "10:35 AM" today, "Mar 12, 10:35 AM" otherwise; nothing for a stamp that is not a date. */
function when(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

/** What the last button did, as a banner at the top of the item. */
function Result({ record, onGo }: { record: ItemRecord; onGo: (id: string) => void }) {
  const result = record.result;
  if (result === null) return null;
  // A sent review shows its pick and notes in place instead.
  if (result.feedback !== undefined && result.error === undefined) return null;
  const failed = result.error !== undefined || (result.exitCode !== undefined && result.exitCode !== 0);
  const stamp = when(result.at);
  return (
    <div
      role="status"
      className={cn(
        "mt-3 rounded-md border px-3 py-2 text-sm",
        failed ? "border-destructive/40 bg-destructive/10" : "border-success/40 bg-success/10",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span aria-hidden className={cn("font-medium", failed ? "text-destructive" : "text-success")}>
          {failed ? "!" : "✓"}
        </span>
        <span className="min-w-0 flex-1 text-foreground">
          <span className="font-medium">{result.label}</span>
          <span className="text-muted-foreground">
            {failed ? " failed" : ""}
            {result.exitCode === undefined ? "" : ` · exit ${result.exitCode}`}
            {result.edited ? " · edited" : ""}
          </span>
          {result.threadId === undefined ? null : (
            <>
              <span className="text-muted-foreground">{" · "}</span>
              <button type="button" className="font-mono text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={() => onGo(result.threadId!)}>
                {result.threadId}
              </button>
            </>
          )}
        </span>
        {stamp === "" ? null : <span className="shrink-0 text-xs text-muted-foreground">{stamp}</span>}
      </div>
      {result.error === undefined ? null : <div className="mt-1 text-xs text-destructive">{result.error}</div>}
      {result.output === undefined || result.output === "" ? null : (
        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground">{result.output}</pre>
      )}
    </div>
  );
}

function ActionButton({
  action,
  openedThread,
  busy,
  used,
  onRun,
  onConfirm,
  onGo,
}: {
  action: Action;
  /** The thread this action already opened, so a second click does not open another. */
  openedThread: string | null;
  busy: boolean;
  /** An action on this item already went through, so the rest are spent. */
  used: boolean;
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
    <Button size="sm" variant={variant} disabled={busy || used} onClick={action.type === "command" ? onConfirm : onRun}>
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
  initialDraftMode,
  review,
  onRun,
  onDismiss,
  onGo,
}: {
  item: Item;
  record: ItemRecord | undefined;
  busy: boolean;
  initiallyExpanded: boolean;
  initiallyConfirming: number | null;
  initialDraftMode?: "preview" | "raw";
  review?: { imageUrl: (index: number) => string | null | undefined; onSubmit: (feedback: Feedback) => void; initial?: Feedback };
  onRun: (index: number, draft?: string) => void;
  onDismiss: (dismissed: boolean) => void;
  onGo: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [confirming, setConfirming] = useState<number | null>(initiallyConfirming);
  const [draft, setDraft] = useState(item.draft);
  const draftChanged = draft.trim() !== item.draft.trim();
  const run = (index: number) => {
    const action = item.actions[index]!;
    onRun(index, usesDraft(action) && draftChanged && draft.trim() !== "" ? draft.trim() : undefined);
  };
  const state = record?.state ?? "open";
  const pending = confirming === null ? null : item.actions[confirming];

  return (
    <li className={cn("rounded-lg border border-border bg-card px-4 py-3", state === "dismissed" && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">
            {item.url === undefined ? (
              item.title
            ) : (
              <UrlLink href={item.url} className="hover:underline" title={item.url}>
                {item.title}
                <span aria-hidden className="ml-1 text-xs text-muted-foreground">↗</span>
              </UrlLink>
            )}
          </div>
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

      {/* What happened comes first, above the evidence for it. */}
      {record === undefined ? null : <Result record={record} onGo={onGo} />}

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

      {item.variations.length === 0 || review === undefined ? null : (
        <ReviewPanel
          item={item}
          record={record}
          imageUrl={review.imageUrl}
          busy={busy}
          onSubmit={review.onSubmit}
          initial={review.initial}
        />
      )}

      {/* One box for the item's draft: every button that says {draft} sends it as left here. */}
      {item.draft === "" ? null : (
        <DraftEditor
          label={item.draftLabel}
          value={state === "open" ? draft : item.draft}
          original={item.draft}
          onChange={state === "open" ? setDraft : undefined}
          initialMode={initialDraftMode}
        />
      )}

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
              used={state === "done"}
              onRun={() => run(index)}
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

export function ViewPanel({ stored, busyItem, onRun, onDismiss, onGoToThread, confirming, focusItemId, draftMode, imageUrl, onSubmitReview, reviewInitial }: ViewPanelProps) {
  const { view } = stored;
  const [confirmItem, confirmIndex] = confirming?.split(":") ?? [];
  const picked = focusItemId ? view.sections.flatMap((section) => section.items).find((item) => item.id === focusItemId) : undefined;
  // The list lives above the composer; the panel shows one entry from it,
  // starting on the first open one.
  const focused = picked ?? firstOpenItem(stored) ?? undefined;

  if (focused === undefined) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center">
        <div className="text-sm font-medium text-foreground">{view.title}</div>
        <div className="mt-1 text-sm text-muted-foreground">Click on an entry to see its full details.</div>
      </div>
    );
  }

  const section = view.sections.find((candidate) => candidate.items.includes(focused));
  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="truncate text-xs text-muted-foreground">
          {view.title}
          {section?.title ? ` · ${section.title}` : ""}
        </div>
        <ol>
          {/* Keyed on the confirmation too, so a command clicked in the list opens asking. */}
          <ItemCard
            key={`${focused.id}:${confirming ?? ""}`}
            item={focused}
            record={stored.items[focused.id]}
            busy={busyItem === focused.id}
            initiallyExpanded
            initiallyConfirming={confirmItem === focused.id ? Number(confirmIndex) : null}
            initialDraftMode={draftMode}
            review={{
              imageUrl: (index) => imageUrl?.(focused.id, index),
              onSubmit: (feedback) => onSubmitReview?.(focused, feedback),
              initial: reviewInitial,
            }}
            onRun={(index, draft) => onRun(focused, index, draft)}
            onDismiss={(dismissed) => onDismiss(focused, dismissed)}
            onGo={onGoToThread}
          />
        </ol>
      </div>
    </div>
  );
}
