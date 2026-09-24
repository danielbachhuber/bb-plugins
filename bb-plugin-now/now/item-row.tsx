// One row of the Now page: what the item is, and what can be done with it
// from here. Draws only; every action is a callback.
import { useState, type ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { BrandIcon, type Brand } from "./brand-icon.js";
import { MergeSplitButton, type MergeMethod } from "./merge-button.js";
import { PullRequestBar, PullRequestSegment } from "./pull-request-bar.js";
import { describeActivity, describeDue } from "./due.js";
import { shortDate } from "./sections.js";
import { snoozeChoices } from "./snooze.js";
import type { GitHubPart, Item } from "./types.js";

export type Reply = "accepted" | "declined" | "tentative";

/** An action a row is waiting on. The whole row is disabled until it lands. */
export type PendingAction = "complete" | "archive" | "snooze" | "unsnooze" | "merge" | `rsvp:${Reply}`;

const PENDING_LABEL: Record<PendingAction, string> = {
  complete: "Completing…",
  archive: "Archiving…",
  snooze: "Snoozing…",
  unsnooze: "Unsnoozing…",
  merge: "Merging…",
  "rsvp:accepted": "Replying…",
  "rsvp:declined": "Replying…",
  "rsvp:tentative": "Replying…",
};

export interface RowActions {
  onSnooze: (item: Item, until: string) => void;
  onUnsnooze: (item: Item) => void;
  onArchive: (item: Item) => void;
  onComplete: (item: Item) => void;
  onRsvp: (item: Item, response: Reply) => void;
  onMerge: (item: Item, method: MergeMethod) => void;
  /** Resolves true once the comment is posted, so the box can close. */
  onReply: (item: Item, body: string) => Promise<boolean>;
  onStartThread: (item: Item) => void;
  onOpenThread: (threadId: string) => void;
}

/** Which source a row came from, drawn at the head of its row. */
function brandOf(item: Item): Brand | null {
  if (item.github !== null) return "github";
  if (item.doc != null) return "gdocs";
  if (item.source === "todoist") return "todoist";
  if (item.source === "gmail") return "gmail";
  return null;
}

const PRIORITY: Record<1 | 2 | 3, string> = {
  1: "border-destructive/40 text-destructive-text",
  2: "border-warning/40 text-warning-text",
  3: "border-border text-foreground",
};

/**
 * Why a GitHub row can be archived, or null when it still wants something of
 * you: a merged or closed pull request, or a closed issue, has nothing left to
 * do, and neither does one you hear about only because a team you are in, or
 * someone else, was asked to review it.
 */
export function archiveReason(item: Item): string | null {
  const github = item.github;
  if (item.gmail === null) return null;
  if (item.invite?.cancelled === true) return "it's canceled";
  if (item.invite?.response === "accepted" || item.invite?.response === "declined" || item.invite?.response === "tentative") {
    return "you replied";
  }
  if (github === null) return null;
  if (github.state === "merged" || github.state === "closed") return `it's ${github.state}`;
  if (github.reason === "review_requested" && github.reviewRequested === "others") return "not your review";
  return null;
}

/** Whether the row asks for your review, for its label. */
function reviewIsYours(github: GitHubPart): boolean {
  if (github.reviewRequested !== undefined && github.reviewRequested !== null) return github.reviewRequested === "you";
  return github.reason === "review_requested";
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("mt-0.5 shrink-0 rounded border px-1.5 text-[11px] leading-4", className)}>{children}</span>
  );
}

/** GitHub's review-requested amber, for a mention, which asks something of you too. */
const MENTIONED = "border-[#9a6700]/40 text-[#9a6700] dark:border-[#d29922]/40 dark:text-[#d29922]";

/** Unread messages quoted on a row before the rest are counted instead. */
const MAX_QUOTES = 5;

/** The merged-purple an Archive suggestion is tinted with. */
const SUGGESTED = "text-[#8250df] hover:text-[#8250df] dark:text-[#a371f7] dark:hover:text-[#a371f7]";

function SnoozeMenu({
  item,
  until,
  now,
  actions,
  pending,
}: {
  item: Item;
  until: string | null;
  now: Date;
  actions: RowActions;
  pending: PendingAction | null;
}) {
  const working = pending === "snooze" || pending === "unsnooze";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          disabled={pending !== null}
          aria-busy={working}
          aria-label={
            working ? PENDING_LABEL[pending] : until === null ? `Snooze "${item.title}"` : `Unsnooze "${item.title}"`
          }
        >
          <Icon name={working ? "Loading" : "Pause"} className={cn("size-4", working && "animate-spin")} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {until === null ? (
          snoozeChoices(now).map((choice) => (
            <DropdownMenuItem key={choice.label} onSelect={() => actions.onSnooze(item, choice.until)}>
              {choice.label}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem onSelect={() => actions.onUnsnooze(item)}>
            <Icon name="RotateCcw" className="size-4" />
            Unsnooze
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ReplyBox({ item, onReply, onClose }: { item: Item; onReply: RowActions["onReply"]; onClose: () => void }) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const github = item.github!;

  const send = async () => {
    if (body.trim() === "" || sending) return;
    setSending(true);
    try {
      if (await onReply(item, body)) onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
          if (event.key === "Escape") onClose();
        }}
        placeholder={`Comment on ${github.repo}#${github.number} as you`}
        aria-label={`Reply on ${github.repo}#${github.number}`}
        className="min-h-20 text-sm"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-muted-foreground">Posts a comment on GitHub. ⌘↩ to send.</span>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={sending}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void send()} disabled={sending || body.trim() === ""}>
          <Icon name={sending ? "Spinner" : "Sent"} className="size-4" />
          {sending ? "Sending…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}

export interface ItemRowProps {
  item: Item;
  now: Date;
  actions?: RowActions;
  /** When a snooze is hiding the row, its end. */
  snoozedUntil?: string | null;
  /** The thread already started from this row. */
  threadId?: string | null;
  /** The action this row is waiting on, if any. */
  pending?: PendingAction | null;
}

/** A small labelled button in the details line, for the row's own action. */
const REPLIES: Array<{ response: Reply; label: string }> = [
  { response: "accepted", label: "Yes" },
  { response: "declined", label: "No" },
  { response: "tentative", label: "Maybe" },
];

/**
 * Yes, No, and Maybe for an invitation, as Gmail puts them under one: your
 * reply now is the one marked, and clicking another replies in Calendar.
 */
function RsvpControl({
  invite,
  pending,
  disabled,
  onRsvp,
}: {
  invite: NonNullable<Item["invite"]>;
  pending: PendingAction | null;
  disabled: boolean;
  onRsvp?: (response: Reply) => void;
}) {
  if (invite.cancelled) {
    return <p className="mt-1.5 text-xs text-muted-foreground">This event was canceled.</p>;
  }
  if (invite.eventId === null) return null;
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Going?</span>
      <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="Reply to the invitation">
        {REPLIES.map(({ response, label }, index) => {
          const chosen = invite.response === response;
          const working = pending === `rsvp:${response}`;
          return (
            <button
              key={response}
              type="button"
              aria-pressed={chosen}
              disabled={disabled || onRsvp === undefined}
              onClick={chosen ? undefined : () => onRsvp?.(response)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5",
                index > 0 && "border-l border-border",
                chosen ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                "disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {working ? <Icon name="Loading" className="size-3 animate-spin" /> : chosen ? <Icon name="Check" className="size-3" /> : null}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LineAction({
  label,
  icon,
  hoverIcon,
  onClick,
  className,
  ariaLabel,
  expanded,
  disabled = false,
  working = null,
}: {
  label: string;
  icon: IconName;
  /** Drawn instead of `icon` on hover, as Complete's circle fills with a check. */
  hoverIcon?: IconName;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
  expanded?: boolean;
  disabled?: boolean;
  /** While this button's own request runs: what it is doing, shown with a spinner. */
  working?: string | null;
}) {
  if (working !== null) {
    return (
      <span className={cn("-mx-1 inline-flex items-center gap-1 px-1 text-foreground", className)} role="status">
        <Icon name="Loading" className="size-3 animate-spin" />
        {working}
      </span>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "group/action -mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      aria-label={ariaLabel}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <Icon name={icon} className={cn("size-3", hoverIcon !== undefined && "group-hover/action:hidden")} />
      {hoverIcon === undefined ? null : <Icon name={hoverIcon} className="hidden size-3 group-hover/action:block" />}
      {label}
    </button>
  );
}

/** A deadline that is today or already past: the one date the page colors. */
function deadlineDue(deadline: string, now: Date): boolean {
  return describeDue({ date: deadline, recurring: false }, now).tone !== "upcoming";
}

/**
 * The date at the right of the title line, in one short form: when it is
 * due, else its deadline, else when its latest email arrived. The section
 * heading says whether it is overdue, so only a deadline that is today or past
 * is colored.
 */
function rowDate(item: Item, now: Date): { text: string; urgent: boolean; icon: IconName | null } | null {
  if (item.due !== null) {
    return { text: shortDate(item.due.date, now), urgent: false, icon: item.due.recurring ? "Repeat" : null };
  }
  if (item.deadline !== null) {
    return { text: shortDate(item.deadline, now), urgent: deadlineDue(item.deadline, now), icon: "Target" };
  }
  if (item.activityAt !== null) return { text: shortDate(item.activityAt, now), urgent: false, icon: null };
  return null;
}

export function ItemRow({ item, now, actions, snoozedUntil = null, threadId = null, pending = null }: ItemRowProps) {
  const busy = pending !== null;
  const mergeMethods = actions === undefined ? [] : (item.github?.mergeMethods ?? []);
  const merge =
    mergeMethods.length === 0 || actions === undefined ? null : (
      <MergeSplitButton
        methods={mergeMethods}
        disabled={busy}
        working={pending === "merge"}
        onMerge={(method) => actions.onMerge(item, method)}
      />
    );
  const [replying, setReplying] = useState(false);
  const date = rowDate(item, now);
  // Shown in the details line only when the title line is showing the due date instead.
  const deadline = item.due !== null && item.deadline !== null ? item.deadline : null;
  const brand = brandOf(item);
  const archiveSuggestion = archiveReason(item);
  const archiveSuggested = archiveSuggestion !== null;
  // Every unread message when there are any, else the latest thing written.
  const unreadQuotes = item.github?.unreadQuotes ?? [];
  const latest = item.github?.comment ?? null;
  const quotes: ReadonlyArray<{ author: string | null; text: string; url?: string | null }> = item.doc?.quotes ?? (unreadQuotes.length > 0 ? unreadQuotes : latest === null ? [] : [latest]);
  const unread = item.gmail?.unread === true;
  // A row of several messages says how many are new; the dot alone would not.
  const unreadMessages = item.gmail?.unreadMessages ?? 0;
  const newCount = unread && (item.gmail?.messages ?? 1) > 1 && unreadMessages > 0 ? unreadMessages : null;

  const github = item.github;
  // The pull request or issue, in GitHub Context's banner card, closing the row.
  const card =
    github === null ? null : (
      <div className="mt-2">
        <PullRequestBar
          left={<PullRequestSegment github={github} url={item.url} yours={reviewIsYours(github)} />}
          right={merge}
        />
      </div>
    );

  return (
    <li className={cn("py-3.5 text-sm transition-opacity", busy && "opacity-60")} aria-busy={busy}>
      <div className="flex items-start gap-3">
        {/* Where it is from, in a column of its own so every title starts at one edge. */}
        <div className="flex w-5 shrink-0 flex-col items-center gap-1.5 pt-0.5">
          {brand === null ? <span className="size-4" /> : <BrandIcon brand={brand} className="size-4" />}
          {/* Gmail's own unread blue. */}
          {unread ? <span className="size-1.5 rounded-full bg-[#0b57d0] dark:bg-[#a8c7fa]" aria-label="Unread" /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <UrlLink
              href={item.url}
              className={cn("min-w-0 flex-1 text-foreground hover:underline", unread && "font-semibold")}
            >
              {item.title}
            </UrlLink>
            {item.doc?.mentioned === true ? <Chip className={MENTIONED}>Mentioned</Chip> : null}
            {item.priority === null ? null : (
              <Chip className={cn("font-mono", PRIORITY[item.priority])}>P{item.priority}</Chip>
            )}
            {newCount === null ? null : (
              <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-[#0b57d0] dark:text-[#a8c7fa]">
                {newCount} new
              </span>
            )}
            {date === null ? null : (
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums",
                  date.urgent ? "text-destructive-text" : "text-muted-foreground",
                )}
              >
                {date.icon === "Target" ? <Icon name="Target" className="size-3" aria-label="Deadline" /> : null}
                {date.text}
                {date.icon === "Repeat" ? <Icon name="Repeat" className="size-3" aria-label="Recurring" /> : null}
              </span>
            )}
          </div>
          {item.description === "" ? null : (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          )}
          {item.invite == null ? null : (
            <RsvpControl
              invite={item.invite}
              pending={pending}
              disabled={busy}
              onRsvp={actions === undefined ? undefined : (response) => actions.onRsvp(item, response)}
            />
          )}
          {quotes.length === 0 ? null : (
            <div className="mt-1 space-y-1 border-l-2 border-border pl-2 text-xs text-foreground/80">
              {quotes.slice(0, MAX_QUOTES).map((quote, index) => (
                <p key={index} className="line-clamp-2">
                  {quote.author === null ? null : <span className="font-medium">{quote.author}: </span>}
                  {quote.text}
                  {quote.url != null ? (
                    <UrlLink
                      href={quote.url}
                      className="ml-1 inline-flex align-[-2px] text-muted-foreground hover:text-foreground"
                      aria-label="Open this comment"
                    >
                      <Icon name="ExternalLink" className="size-3" />
                    </UrlLink>
                  ) : null}
                </p>
              ))}
              {quotes.length > MAX_QUOTES ? (
                <p className="text-muted-foreground">and {quotes.length - MAX_QUOTES} more</p>
              ) : null}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {actions === undefined ? null : item.source === "todoist" ? (
              <LineAction
                label="Complete"
                icon="Circle"
                hoverIcon="CircleCheck"
                ariaLabel={`Complete "${item.title}"`}
                disabled={busy}
                working={pending === "complete" ? PENDING_LABEL.complete : null}
                onClick={() => actions.onComplete(item)}
              />
            ) : item.gmail !== null ? (
              <LineAction
                label={archiveSuggested ? `Archive, ${archiveSuggestion}` : "Archive"}
                icon="Archive"
                ariaLabel={`Archive "${item.title}"`}
                className={archiveSuggested ? SUGGESTED : undefined}
                disabled={busy}
                working={pending === "archive" ? PENDING_LABEL.archive : null}
                onClick={() => actions.onArchive(item)}
              />
            ) : null}
            {item.doc?.url == null ? null : (
              <UrlLink
                href={item.doc.url}
                className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
              >
                <Icon name="ExternalLink" className="size-3" />
                Open in {item.context ?? "Google Docs"}
              </UrlLink>
            )}
            {actions === undefined || item.github === null ? null : (
              <LineAction
                label="Reply"
                icon="ArrowTurnBackward"
                expanded={replying}
                disabled={busy}
                onClick={() => setReplying((open) => !open)}
              />
            )}
            {actions === undefined ? null : threadId === null ? (
              <LineAction
                label="Start thread"
                icon="MessageSquarePlus"
                disabled={busy}
                onClick={() => actions.onStartThread(item)}
              />
            ) : (
              <LineAction
                label="Open thread"
                icon="MessageSquare"
                disabled={busy}
                onClick={() => actions.onOpenThread(threadId)}
              />
            )}
            {deadline === null ? null : (
              <span
                className={cn("inline-flex items-center gap-1", deadlineDue(deadline, now) && "text-destructive-text")}
              >
                <Icon name="Target" className="size-3" />
                Deadline {shortDate(deadline, now)}
              </span>
            )}
            {item.tags.map((tag) => (
              <span key={tag}>@{tag}</span>
            ))}
            {snoozedUntil === null ? null : (
              <span className="inline-flex items-center gap-1">
                <Icon name="Pause" className="size-3" />
                until {describeActivity(snoozedUntil, now)}
              </span>
            )}
            {item.context === null || github !== null ? null : <span className="ml-auto truncate">{item.context}</span>}
          </div>
          {card}
          {replying && actions !== undefined && item.github !== null ? (
            <ReplyBox item={item} onReply={actions.onReply} onClose={() => setReplying(false)} />
          ) : null}
        </div>

        {actions === undefined ? null : (
          <div className="-mr-1.5 shrink-0">
            <SnoozeMenu item={item} until={snoozedUntil} now={now} actions={actions} pending={pending} />
          </div>
        )}
      </div>
    </li>
  );
}
