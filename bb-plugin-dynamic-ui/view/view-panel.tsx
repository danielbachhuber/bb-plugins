// What a view's tab draws. Kept free of RPC so a story can render it with
// fixture props.
import { useState, type ReactNode } from "react";
import { Markdown, UrlLink } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dismissLabelOf, isQuiet, needsConfirm, usesDraft, usesDraftAsAfter, usesNote, type Action, type HistoryEntry, type Item } from "./schema.js";
import type { ItemRecord, StoredView } from "./store.js";
import { ChangesBlock, type ChangesMode } from "./changes-block.js";
import { DraftEditor } from "./draft-editor.js";
import type { Feedback } from "./review.js";
import { ReviewPanel } from "./review-panel.js";

export interface ViewPanelProps {
  stored: StoredView;
  /** Which item has an action in flight. */
  busyItem: string | null;
  /** `draft` is the item's draft as the user edited it; absent when unchanged. `note` is the push-back note, for a button that sends it. */
  onRun: (item: Item, index: number, draft?: string, note?: string) => void;
  onDismiss: (item: Item, dismissed: boolean) => void;
  onGoToThread: (threadId: string) => void;
  /** An item whose command confirmation starts open, as `itemId:index`. */
  confirming?: string;
  /** The item picked in the list above the composer. None picked shows the first open item. */
  focusItemId?: string | null;
  /** Whether the draft starts rendered or as source. Preview unless a story says otherwise. */
  draftMode?: "preview" | "raw";
  /** How the changes block starts, for a story. */
  changesMode?: ChangesMode;
  /** A visual review's image as a URL; undefined while it loads. */
  imageUrl?: (itemId: string, index: number) => string | null | undefined;
  onSubmitReview?: (item: Item, feedback: Feedback) => void;
  /** A visual review's starting pick and notes, for a story. */
  reviewInitial?: Feedback;
  /** Opens the new-thread composer seeded with the item. */
  onStartThread?: (item: Item) => void;
}

export const TONE_CLASS: Record<string, string> = {
  neutral: "border-border text-muted-foreground",
  info: "border-border text-foreground",
  success: "border-success/40 text-success",
  warning: "border-warning/40 text-warning",
  danger: "border-destructive/40 text-destructive",
};

/**
 * The open item to show after `itemId` is handled: the next open one below it,
 * or else the first open one above it, or null once none is open.
 */
export function nextOpenItem(stored: StoredView, itemId: string): Item | null {
  const items = stored.view.sections.flatMap((section) => section.items);
  const at = items.findIndex((item) => item.id === itemId);
  const isOpen = (item: Item) =>
    item.id !== itemId && !isQuiet(stored.view, item) && (stored.items[item.id]?.state ?? "open") === "open";
  return items.slice(at + 1).find(isOpen) ?? items.slice(0, Math.max(at, 0)).find(isOpen) ?? null;
}

/**
 * The item shown when none is picked: the first one still open, or null once
 * all are handled. A list view's plain row has nothing to decide, so it is
 * never shown.
 */
export function firstOpenItem(stored: StoredView): Item | null {
  for (const section of stored.view.sections) {
    for (const item of section.items) {
      if (!isQuiet(stored.view, item) && (stored.items[item.id]?.state ?? "open") === "open") return item;
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

/**
 * Whether the item shows what its last button did. An item whose status the
 * agent sets goes round after round, so its result shows only until the
 * agent publishes again; from then its history says what happened.
 */
export function showsResult(item: Item, record: ItemRecord | undefined, publishedAt: string): boolean {
  const result = record?.result;
  if (result === null || result === undefined) return false;
  return item.status === undefined || result.at >= publishedAt;
}

/** The time a history entry names, or its label as written. */
function historyTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The item's back and forth, oldest first: each round proposed and each push-back. */
function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-1 border-l border-border pl-3 text-xs" aria-label="History">
      {entries.map((entry, i) => (
        <li key={i} className="flex gap-2">
          {entry.at === undefined ? null : <span className="w-16 shrink-0 text-muted-foreground">{historyTime(entry.at)}</span>}
          <span className={entry.who === "user" ? "text-foreground" : "text-muted-foreground"}>
            {entry.who === "user" ? `You: “${entry.text}”` : entry.text}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A short, stable name for a draft, so the card starts over when the agent publishes a new one. */
export function draftKey(draft: string): string {
  let hash = 5381;
  for (let i = 0; i < draft.length; i++) hash = ((hash << 5) + hash + draft.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
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
            {result.draft === undefined ? "" : ` · “${result.draft}”`}
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
  blank = false,
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
  /** The button sends a one-line draft that is still empty. */
  blank?: boolean;
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
    <Button size="sm" variant={variant} disabled={busy || used || blank} onClick={needsConfirm(action) ? onConfirm : onRun}>
      {action.label}
    </Button>
  );
}

/**
 * The button Enter presses in a one-line draft: the primary among those that
 * send it, or else the first. Never one that would drop what the user typed.
 */
export function enterAction(item: Item): number | undefined {
  const sends = item.actions.flatMap((action, index) => (usesDraft(action) ? [index] : []));
  return sends.find((index) => item.actions[index]!.primary) ?? sends[0];
}

/**
 * A one-line draft's buttons: the ones that do not send it in a row, then the
 * field with the buttons that do on its right.
 */
function TextDraftActions({
  item,
  draft,
  onChange,
  button,
  busy,
  onEnter,
}: {
  item: Item;
  draft: string;
  /** Absent once the item is done: the field shows what was sent. */
  onChange?: (value: string) => void;
  button: (index: number) => ReactNode;
  busy: boolean;
  onEnter: (index: number) => void;
}) {
  const indexes = item.actions.map((_, index) => index);
  const sends = indexes.filter((index) => usesDraft(item.actions[index]!));
  const others = indexes.filter((index) => !sends.includes(index));
  const enter = enterAction(item);
  const editable = onChange !== undefined;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {others.length === 0 ? null : <div className="flex flex-wrap gap-2">{others.map(button)}</div>}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{item.draftLabel}</span>
        <div className="flex gap-2">
          <Input
            aria-label={item.draftLabel}
            className="h-8 min-w-0 flex-1 text-sm"
            value={draft}
            placeholder={item.draftPlaceholder}
            disabled={!editable}
            onChange={(event) => onChange?.(event.target.value)}
            onKeyDown={(event) => {
              // Enter while an IME is composing picks a candidate, not the button.
              if (event.key !== "Enter" || event.nativeEvent.isComposing || enter === undefined) return;
              event.preventDefault();
              if (editable && !busy && draft.trim() !== "") onEnter(enter);
            }}
          />
          {sends.map(button)}
        </div>
      </div>
      {busy ? <span className="text-xs text-muted-foreground">Working…</span> : null}
    </div>
  );
}

function ItemCard({
  item,
  record,
  publishedAt,
  dismissLabel,
  busy,
  initiallyExpanded,
  initiallyConfirming,
  initialDraftMode,
  initialChangesMode,
  review,
  onRun,
  onDismiss,
  onGo,
  onStartThread,
}: {
  item: Item;
  record: ItemRecord | undefined;
  /** When the view was last published, which retires an agent-set item's last result. */
  publishedAt: string;
  /** What Dismiss is called on this item, such as "Skip". */
  dismissLabel: string;
  busy: boolean;
  initiallyExpanded: boolean;
  initiallyConfirming: number | null;
  initialDraftMode?: "preview" | "raw";
  initialChangesMode?: ChangesMode;
  review?: { imageUrl: (index: number) => string | null | undefined; onSubmit: (feedback: Feedback) => void; initial?: Feedback };
  onRun: (index: number, draft?: string, note?: string) => void;
  onDismiss: (dismissed: boolean) => void;
  onGo: (id: string) => void;
  onStartThread?: () => void;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [confirming, setConfirming] = useState<number | null>(initiallyConfirming);
  // A failed send keeps what the user typed in a one-line field.
  const [draft, setDraft] = useState(record?.result?.draft ?? item.draft);
  const draftChanged = draft.trim() !== item.draft.trim();
  const [note, setNote] = useState("");
  const run = (index: number) => {
    const action = item.actions[index]!;
    onRun(
      index,
      usesDraft(action) && draftChanged && draft.trim() !== "" ? draft.trim() : undefined,
      usesNote(action) ? note.trim() : undefined,
    );
  };
  const state = record?.state ?? "open";
  const textDraft = item.draftFormat === "text";
  const blank = textDraft && draft.trim() === "";
  const pending = confirming === null ? null : item.actions[confirming];
  const button = (index: number) => {
    const action = item.actions[index]!;
    return (
      <ActionButton
        key={`${action.type}:${action.label}`}
        action={action}
        openedThread={
          action.type === "thread" && record?.result?.label === action.label ? (record.result.threadId ?? null) : null
        }
        busy={busy}
        used={state === "done"}
        blank={blank && usesDraft(action)}
        onRun={() => run(index)}
        onConfirm={() => setConfirming(index)}
        onGo={onGo}
      />
    );
  };

  return (
    <li className={cn("rounded-lg border border-border bg-card px-4 py-3", state === "dismissed" && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground">
            {item.url === undefined ? (
              item.title
            ) : (
              <UrlLink href={item.url} className="group hover:underline" title={item.url}>
                {item.title}
                {/* bb's own external-link icon, as its file and PR links use. */}
                <Icon
                  name="ExternalLink"
                  aria-hidden
                  className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground group-hover:text-foreground"
                />
              </UrlLink>
            )}
          </div>
          {item.badges.length === 0 && item.status === undefined && state !== "dismissed" ? null : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {/* A done item shows what happened in its result, not a tag. */}
              {state === "dismissed" ? (
                <span className="rounded border border-border px-1.5 py-px text-[11px] text-muted-foreground">
                  {dismissLabel === "Dismiss" ? "Dismissed" : dismissLabel}
                </span>
              ) : null}
              {item.status === undefined ? null : (
                <span className={cn("rounded border px-1.5 py-px text-[11px]", TONE_CLASS[item.status.tone])}>{item.status.label}</span>
              )}
              {item.badges.map((badge) => (
                <span key={badge.label} className={cn("rounded border px-1.5 py-px text-[11px]", TONE_CLASS[badge.tone])}>
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          {/* Beside Dismiss, not among the item's decisions, so it stays usable after one is made. */}
          {onStartThread === undefined ? null : (
            <Button size="sm" variant="outline" onClick={onStartThread}>
              <Icon name="MessageSquarePlus" aria-hidden />
              Start thread
            </Button>
          )}
          {/* Archive, not X: a dismissed item can be restored, and an X reads as closing the panel. */}
          {state === "dismissed" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onDismiss(false)}>
              <Icon name="ArchiveRestore" aria-hidden />
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onDismiss(true)}>
              <Icon name="Archive" aria-hidden />
              {dismissLabel}
            </Button>
          )}
        </div>
      </div>

      {/* What happened comes first, above the evidence for it. */}
      {record === undefined || !showsResult(item, record, publishedAt) ? null : <Result record={record} onGo={onGo} />}

      {item.summary === "" ? null : (
        <div className="mt-2 text-sm">
          <Markdown content={item.summary} />
        </div>
      )}
      {item.history.length === 0 ? null : <History entries={item.history} />}
      {item.changes.length === 0 ? null : (
        <ChangesBlock
          item={item}
          draft={state === "open" ? draft : (record?.result?.draft ?? item.draft)}
          onDraftChange={state === "open" ? setDraft : undefined}
          initialMode={initialChangesMode}
        />
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
      {/* A change that compares against the draft edits it in place instead. */}
      {item.draft === "" || textDraft || item.changes.some(usesDraftAsAfter) ? null : (
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
      ) : item.actions.length === 0 || state === "dismissed" ? null : textDraft ? (
        <TextDraftActions
          item={item}
          draft={state === "open" ? draft : (record?.result?.draft ?? item.draft)}
          onChange={state === "open" ? setDraft : undefined}
          button={button}
          busy={busy}
          onEnter={run}
        />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {/* The push-back goes first, beside the buttons that send it. */}
          {item.note === undefined || state !== "open" ? null : (
            <Input
              aria-label={item.note.label}
              placeholder={item.note.placeholder ?? item.note.label}
              className="h-8 min-w-[12rem] flex-1 text-sm"
              value={note}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                const sends = item.actions.flatMap((action, index) => (usesNote(action) ? [index] : []));
                const target = sends.find((index) => item.actions[index]!.primary) ?? sends[0];
                if (target === undefined) return;
                event.preventDefault();
                run(target);
              }}
            />
          )}
          {item.actions.map((_, index) => button(index))}
          {busy ? <span className="self-center text-xs text-muted-foreground">Working…</span> : null}
        </div>
      )}
    </li>
  );
}

export function ViewPanel({ stored, busyItem, onRun, onDismiss, onGoToThread, confirming, focusItemId, draftMode, changesMode, imageUrl, onSubmitReview, reviewInitial, onStartThread }: ViewPanelProps) {
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
            key={`${focused.id}:${confirming ?? ""}:${draftKey(focused.draft)}`}
            item={focused}
            record={stored.items[focused.id]}
            publishedAt={stored.publishedAt}
            dismissLabel={dismissLabelOf(view, focused)}
            busy={busyItem === focused.id}
            initiallyExpanded
            initiallyConfirming={confirmItem === focused.id ? Number(confirmIndex) : null}
            initialDraftMode={draftMode}
            initialChangesMode={changesMode}
            review={{
              imageUrl: (index) => imageUrl?.(focused.id, index),
              onSubmit: (feedback) => onSubmitReview?.(focused, feedback),
              initial: reviewInitial,
            }}
            onRun={(index, draft) => onRun(focused, index, draft)}
            onDismiss={(dismissed) => onDismiss(focused, dismissed)}
            onGo={onGoToThread}
            onStartThread={onStartThread === undefined ? undefined : () => onStartThread(focused)}
          />
        </ol>
      </div>
    </div>
  );
}
