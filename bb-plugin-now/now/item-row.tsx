// One row of the Now page: what the item is, and what can be done with it
// from here. Draws only; every action is a callback.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Markdown, UrlLink } from "@get-bb/plugin-sdk/app";

import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { BrandIcon, type Brand } from "./brand-icon.js";
import { MergeSplitButton, type MergeMethod } from "./merge-button.js";
import { PullRequestBar, PullRequestSegment } from "./pull-request-bar.js";
import { ReviewerStack } from "./reviewer-stack.js";
import { describeDue } from "./due.js";
import { readable, sortDate } from "./items.js";
import { isAtProposedTime, spanText } from "../calendar/proposal.js";
import { archiveReason, isOverdue, nowGroupOf, overdueText, shortDate } from "./sections.js";
import { PostponeMenu } from "./postpone-menu.js";
import { TaskEdit } from "./task-edit.js";
import type { TaskDraft } from "../todoist/edit.js";
import { postponeTarget } from "../todoist/postpone.js";
import type { GitHubPart, Item, TodoistProject } from "./types.js";

export type Reply = "accepted" | "declined" | "tentative";

/** An action a row is waiting on. The whole row is disabled until it lands. */
export type PendingAction = "complete" | "archive" | "read" | "merge" | "save" | "delete" | "postpone" | "accept" | `rsvp:${Reply}`;

const PENDING_LABEL: Record<PendingAction, string> = {
  complete: "Completing…",
  archive: "Archiving…",
  read: "Marking read…",
  merge: "Merging…",
  save: "Saving…",
  delete: "Deleting…",
  postpone: "Postponing…",
  accept: "Moving…",
  "rsvp:accepted": "Replying…",
  "rsvp:declined": "Replying…",
  "rsvp:tentative": "Replying…",
};

export interface RowActions {
  onArchive: (item: Item) => void;
  onMarkRead: (item: Item) => void;
  onComplete: (item: Item) => void;
  onRsvp: (item: Item, response: Reply) => void;
  /** Moves a proposal row's event to the time its guest proposed. */
  onAcceptProposal: (item: Item) => void;
  onMerge: (item: Item, method: MergeMethod) => void;
  /** Resolves true once the comment is posted, so the box can close. */
  onReply: (item: Item, body: string) => Promise<boolean>;
  onStartThread: (item: Item) => void;
  onOpenThread: (threadId: string) => void;
  /** Saves a Todoist row's edit strip. Resolves true once saved, so the strip can close. */
  onEdit: (item: Item, draft: TaskDraft) => Promise<boolean>;
  onDelete: (item: Item) => void;
  /** Moves a recurring Todoist task's current occurrence to `day`, keeping its rule. */
  onPostpone: (item: Item, day: string) => void;
  /** Opens a plain email row's full message in the page's Email tab. */
  onRead?: (item: Item) => void;
  /**
   * Reads the whole of a GitHub comment the row quotes, from its email.
   * Resolves null when it could not, having said why.
   */
  onLoadComment?: (item: Item, messageId: string) => Promise<{ comment: string; line: string } | null>;
  /**
   * Reads the whole text of a plain email row's latest message, for Show more.
   * Resolves null when it could not, having said why.
   */
  onLoadEmailText?: (item: Item) => Promise<string | null>;
}

/** The row whose email is open in the Email tab, so the list can mark it. */
export const ReadingContext = createContext<string | null>(null);

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
 * A Google document comment that mentions or assigns you. Once you have read
 * it there is nothing to come back for, so opening it and archiving it are
 * one action. A GitHub mention is not one of these: its row has more to do
 * there, such as a reply or a review.
 */
export function mentionsYou(item: Item): boolean {
  return item.gmail !== null && item.doc?.mentioned === true;
}

/**
 * Whether to draw a pull request's reviewers: always while it is open, and
 * after it has merged or closed only when someone reviewed it. Not for an
 * issue, or when gh could not say.
 */
function showReviewers(github: GitHubPart): github is GitHubPart & { reviewers: NonNullable<GitHubPart["reviewers"]> } {
  if (github.kind !== "pull" || github.reviewers === undefined) return false;
  return github.state === "open" || github.state === "draft" || github.reviewers.length > 0;
}

/** Whether the row asks for your review, for its label. */
function reviewIsYours(github: GitHubPart): boolean {
  if (github.myReview !== undefined) return github.myReview === "requested" && github.reviewRequested === "you";
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

/** Markdown that has to start a line: a heading, list, quote, code fence, or table. */
const BLOCK_START = /^(#|>|[-*+] |\d+\. |`{3}|\|)/;

/** One quote in a row: an unread message's line, the latest comment, or a document comment. */
interface Quote {
  author: string | null;
  text: string;
  url?: string | null;
  messageId?: string;
  cut?: boolean;
}

/**
 * Gmail does not say whether it cut a snippet, but it stops them at about 200
 * characters, so one this long may have more behind it.
 */
const MAYBE_CUT_SNIPPET = 150;

/**
 * Whether a row's text runs past its two lines: unknown until measured once
 * at its width, then measured again only when the width changes.
 */
type Fit = "measuring" | "overflow" | "fits";

/**
 * Text drawn two lines at most. When it runs longer, the browser clamps it
 * with "…" and Show more floats into the end of its second line; when it
 * fits, Show more follows it only if `cut` says there is more to read. With
 * `onLoad`, Show more reads the whole of it first and `renderFull` draws that;
 * otherwise it only unclamps the text.
 *
 * Each row checks its fit once, in a ResizeObserver callback, which runs after
 * layout and so reads sizes without making the page lay out again.
 */
function ShowMoreText({
  text,
  lead,
  trailing,
  cut = false,
  onLoad,
  renderFull,
  className,
}: {
  text: string;
  /** Drawn before the text, such as the author of a quote. */
  lead?: ReactNode;
  /** Drawn after the text, before Show more. */
  trailing?: ReactNode;
  cut?: boolean;
  onLoad?: () => Promise<string | null>;
  renderFull?: (full: string, toggle: ReactNode) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [fit, setFit] = useState<Fit>("measuring");
  const measuredWidth = useRef(-1);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadable = cut && onLoad !== undefined;

  useEffect(() => {
    measuredWidth.current = -1;
    setFit("measuring");
  }, [text]);

  useEffect(() => {
    const element = ref.current;
    if (element === null || open || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry!.contentRect.width);
      if (fit === "measuring") {
        measuredWidth.current = width;
        setFit(element.scrollHeight > element.clientHeight + 1 ? "overflow" : "fits");
      } else if (width !== measuredWidth.current) {
        // A new width can change what fits, so measure again from the clamped text alone.
        setFit("measuring");
      } else if (fit === "fits" && loadable) {
        // Text that fits can still leave no room for Show more after it: clamp it instead.
        const lines = element.clientHeight / parseFloat(getComputedStyle(element).lineHeight);
        if (lines > 2.5) setFit("overflow");
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, open, loadable]);

  const show = async () => {
    setOpen(true);
    if (onLoad === undefined || full !== null) return;
    setLoading(true);
    try {
      setFull(await onLoad());
    } finally {
      setLoading(false);
    }
  };

  const button = (floated: boolean) => (
    <button
      type="button"
      disabled={loading}
      onClick={() => (open ? setOpen(false) : void show())}
      className={cn(
        "ml-1 text-muted-foreground hover:text-foreground hover:underline disabled:no-underline",
        floated && "float-right clear-both",
      )}
    >
      {loading ? "Loading…" : open ? "Show less" : "Show more"}
    </button>
  );

  if (open && full !== null && renderFull !== undefined) return <div className={className}>{renderFull(full, button(false))}</div>;
  if (open || fit === "fits") {
    return (
      <div className={className}>
        <p ref={ref}>
          {lead}
          {text}
          {trailing}
          {open || loadable ? button(false) : null}
        </p>
      </div>
    );
  }
  // Clamped. The empty float above the button is a line short of the text's
  // height, which pushes the button down to sit at the end of the last line.
  const overflow = fit === "overflow";
  return (
    <div className={cn("flex", className)}>
      <p
        ref={ref}
        className={cn(
          // The full width, whatever its content: a width that changed with Show more would read as a resize.
          "line-clamp-2 w-full min-w-0",
          overflow && "before:float-right before:h-[calc(100%-1lh)] before:content-['']",
        )}
      >
        {overflow ? button(true) : null}
        {lead}
        {text}
        {trailing}
      </p>
    </div>
  );
}

/**
 * A quote. A GitHub quote whose snippet stopped early is read in full from its
 * email by Show more, and drawn as the Markdown it was written in.
 */
function QuoteLine({ quote, onLoad }: { quote: Quote; onLoad?: () => Promise<string | null> }) {
  const link =
    quote.url != null ? (
      <UrlLink
        href={quote.url}
        className="ml-1 inline-flex align-[-2px] text-muted-foreground hover:text-foreground"
        aria-label="Open this comment"
      >
        <Icon name="ExternalLink" className="size-3" />
      </UrlLink>
    ) : null;
  return (
    <ShowMoreText
      text={quote.text}
      lead={quote.author === null ? null : <span className="font-medium">{quote.author}: </span>}
      trailing={link}
      cut={quote.cut === true}
      onLoad={quote.cut === true ? onLoad : undefined}
      renderFull={(full, toggle) => {
        // The author leads the first paragraph, unless the comment opens with a heading, list, or quote of its own.
        const lead = quote.author === null ? "" : `**${quote.author}:**${BLOCK_START.test(full) ? "\n\n" : " "}`;
        return (
          <>
            <Markdown
              content={lead + full}
              className="text-xs leading-normal text-foreground/80 [&_strong]:font-medium [&_:is(p,ul,ol,pre,blockquote,h1,h2,h3,h4)]:mb-1 [&_:is(p,ul,ol,li,h1,h2,h3,h4)]:text-xs [&_:is(p,ul,ol,li)]:text-foreground/80 [&_li]:mb-0"
            />
            {toggle}
          </>
        );
      }}
    />
  );
}

/** The merged-purple an Archive suggestion is tinted with. */
const SUGGESTED = "text-[#8250df] hover:text-[#8250df] dark:text-[#a371f7] dark:hover:text-[#a371f7]";

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
  /** The thread already started from this row. */
  threadId?: string | null;
  /** The action this row is waiting on, if any. */
  pending?: PendingAction | null;
  /** Your Todoist projects, for the edit strip. Null until they load. */
  projects?: readonly TodoistProject[] | null;
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

/**
 * The time a guest proposed for your event, beside the time it is at now, and
 * a button that moves it there. Once it is there, the line says so instead.
 */
function ProposalControl({
  proposal,
  now,
  pending,
  disabled,
  onAccept,
}: {
  proposal: NonNullable<Item["proposal"]>;
  now: Date;
  pending: PendingAction | null;
  disabled: boolean;
  onAccept?: () => void;
}) {
  if (proposal.cancelled) {
    return <p className="mt-1.5 text-xs text-muted-foreground">This event was canceled.</p>;
  }
  const proposed = spanText(proposal.proposed, now);
  if (isAtProposedTime(proposal.proposed, proposal.current)) {
    return (
      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Icon name="Check" className="size-3" />
        Moved to <span className="font-medium text-foreground">{proposed}</span>
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="text-muted-foreground">
        Proposed <span className="font-medium text-foreground">{proposed}</span>
        {proposal.current === null ? null : <>, instead of {spanText(proposal.current, now, proposal.proposed)}</>}
      </span>
      {proposal.eventId === null ? null : (
        <button
          type="button"
          disabled={disabled || onAccept === undefined}
          onClick={onAccept}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium text-foreground hover:bg-accent",
            "disabled:pointer-events-none disabled:opacity-60",
          )}
        >
          {pending === "accept" ? <Icon name="Loading" className="size-3 animate-spin" /> : <Icon name="Check" className="size-3" />}
          Accept new time
        </button>
      )}
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

/** A deadline that is today or already past, which is colored even when it is not overdue yet. */
function deadlineDue(deadline: string, now: Date): boolean {
  return describeDue({ date: deadline, recurring: false }, now).tone !== "upcoming";
}

/**
 * The date at the right of the title line, in one short form: when it is
 * due, else its deadline, else when its latest email arrived. An overdue row
 * shows how late it is instead; of the rest, only a deadline that is today is
 * colored.
 */
function rowDate(item: Item, now: Date): { text: string; urgent: boolean; icon: IconName | null } | null {
  if (item.due !== null) {
    // A recurring task's time is part of its routine, so it shows on any day, not only today.
    const text = shortDate(item.due.date, now, { clock: item.due.recurring });
    return { text, urgent: false, icon: item.due.recurring ? "Repeat" : null };
  }
  if (item.deadline !== null) {
    return { text: shortDate(item.deadline, now), urgent: deadlineDue(item.deadline, now), icon: "Target" };
  }
  if (item.activityAt !== null) return { text: shortDate(item.activityAt, now), urgent: false, icon: null };
  return null;
}

export function ItemRow({ item, now, actions, threadId = null, pending = null, projects = null }: ItemRowProps) {
  const busy = pending !== null;
  const subtasks = item.todoist?.subtasks ?? [];
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
  // An Inbox task is there to be sorted, so its strip starts open.
  const editable = actions !== undefined && item.source === "todoist";
  const [editing, setEditing] = useState(editable && item.inbox === true);
  const postpone = editable ? postponeTarget(item, now) : null;
  const reading = useContext(ReadingContext) === item.id;
  // An overdue row says how late it is in place of its date, and is tinted red.
  const overdue = isOverdue(item, now);
  // A task in the Today run is tinted in that run's yellow, the same way.
  const dueToday = !overdue && item.gmail === null && sortDate(item) !== null && nowGroupOf(item, now) === "today";
  const date = rowDate(item, now);
  // Shown in the details line only when the title line is showing the due date instead.
  const deadline = item.due !== null && item.deadline !== null ? item.deadline : null;
  const brand = brandOf(item);
  const archiveSuggestion = archiveReason(item);
  const archiveSuggested = archiveSuggestion !== null;
  // Every unread message when there are any, else the latest thing written.
  const unreadQuotes = item.github?.unreadQuotes ?? [];
  const latest = item.github?.comment ?? null;
  const quotes: ReadonlyArray<Quote> = item.doc?.quotes ?? (unreadQuotes.length > 0 ? unreadQuotes : latest === null ? [] : [latest]);
  // A plain email's row shows the latest message's snippet, which Show more replaces with its whole text.
  const loadEmail = actions?.onLoadEmailText;
  const emailText = loadEmail !== undefined && readable(item) ? () => loadEmail(item) : undefined;
  // An unread message's line keeps what happened in front of the comment ("approved: …").
  const asLine = item.doc == null && unreadQuotes.length > 0;
  const loadComment = actions?.onLoadComment;
  const loaderFor = (quote: Quote) =>
    loadComment === undefined || quote.messageId === undefined
      ? undefined
      : async () => {
          const found = await loadComment(item, quote.messageId!);
          return found === null ? null : asLine ? found.line : found.comment;
        };
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
          left={
            <>
              <PullRequestSegment github={github} url={item.url} yours={reviewIsYours(github)} />
              {showReviewers(github) ? <ReviewerStack reviewers={github.reviewers} /> : null}
            </>
          }
          right={merge}
        />
      </div>
    );

  return (
    <li
      className={cn(
        "py-3.5 text-sm transition-opacity",
        busy && "opacity-60",
        reading && "-mx-3 rounded-md bg-accent/60 px-3",
        // Out to the list's edges, with a red bar where its padding was.
        overdue && "-mx-4 border-l-2 border-l-destructive bg-destructive/[0.04] pl-[14px] pr-4",
        dueToday && "-mx-4 border-l-2 border-l-[#eda100] bg-[#eda100]/[0.06] pl-[14px] pr-4 dark:border-l-[#c98500] dark:bg-[#c98500]/[0.08]",
      )}
      aria-busy={busy}
    >
      <div className="flex items-start gap-3">
        {/* Where it is from, in a column of its own so every title starts at one edge. */}
        <div className="flex w-5 shrink-0 flex-col items-center gap-1.5 pt-0.5">
          {brand === null ? <span className="size-4" /> : <BrandIcon brand={brand} className="size-4" />}
          {item.priority === null ? null : (
            <span className={cn("rounded-[3px] border px-0.5 font-mono text-[9px] leading-3", PRIORITY[item.priority])}>
              P{item.priority}
            </span>
          )}
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
            {newCount === null ? null : (
              <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs font-medium tabular-nums text-[#0b57d0] dark:text-[#a8c7fa]">
                {newCount} new
              </span>
            )}
            {date === null ? null : (
              <span
                className={cn(
                  "mt-0.5 inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs tabular-nums",
                  overdue ? "font-medium text-destructive-text" : date.urgent ? "text-destructive-text" : "text-muted-foreground",
                )}
              >
                {date.icon === "Target" ? <Icon name="Target" className="size-3" aria-label="Deadline" /> : null}
                {overdue ? overdueText(item, now) : date.text}
                {date.icon === "Repeat" ? <Icon name="Repeat" className="size-3" aria-label="Recurring" /> : null}
              </span>
            )}
          </div>
          {item.description === "" ? null : item.source === "todoist" ? (
            // Todoist descriptions are Markdown, so lists and links read as they do in Todoist.
            // bb's renderer is sized and colored for chat, so each block is brought down to the row's muted text.
            <Markdown
              content={item.description}
              className="mt-0.5 text-xs leading-normal text-muted-foreground [&_:is(p,ul,ol)]:mb-1 [&_:is(p,ul,ol,li)]:text-muted-foreground [&_li]:mb-0"
            />
          ) : (
            <ShowMoreText
              text={item.description}
              className="mt-0.5 text-xs text-muted-foreground"
              cut={emailText !== undefined && item.description.length >= MAYBE_CUT_SNIPPET}
              onLoad={emailText}
              renderFull={(full, toggle) => (
                <p className="whitespace-pre-line break-words">
                  {full}
                  {toggle}
                </p>
              )}
            />
          )}
          {subtasks.length === 0 ? null : (
            <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground" aria-label="Subtasks">
              {subtasks.map((subtask) => (
                <li key={subtask.id}>{subtask.title}</li>
              ))}
            </ul>
          )}
          {item.invite == null ? null : (
            <RsvpControl
              invite={item.invite}
              pending={pending}
              disabled={busy}
              onRsvp={actions === undefined ? undefined : (response) => actions.onRsvp(item, response)}
            />
          )}
          {item.proposal == null ? null : (
            <ProposalControl
              proposal={item.proposal}
              now={now}
              pending={pending}
              disabled={busy}
              onAccept={actions === undefined ? undefined : () => actions.onAcceptProposal(item)}
            />
          )}
          {quotes.length === 0 ? null : (
            <div className="mt-1 space-y-1 border-l-2 border-border pl-2 text-xs text-foreground/80">
              {quotes.slice(0, MAX_QUOTES).map((quote, index) => (
                <QuoteLine key={quote.messageId ?? index} quote={quote} onLoad={loaderFor(quote)} />
              ))}
              {quotes.length > MAX_QUOTES ? (
                <p className="text-muted-foreground">and {quotes.length - MAX_QUOTES} more</p>
              ) : null}
            </div>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {actions === undefined || !mentionsYou(item) ? null : (
              <UrlLink
                href={item.url}
                onClick={() => {
                  if (!busy) actions.onArchive(item);
                }}
                aria-disabled={busy || undefined}
                className={cn(
                  "inline-flex items-center gap-1 whitespace-nowrap rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground shadow-xs transition-colors hover:bg-state-hover",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                <Icon name="ExternalLink" className="size-3" />
                Open and archive
              </UrlLink>
            )}
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
            {actions?.onRead === undefined || !readable(item) ? null : (
              <LineAction
                label="Open"
                icon="PanelRight"
                ariaLabel={`Open "${item.title}"`}
                expanded={reading}
                className={reading ? "bg-accent text-foreground" : undefined}
                disabled={busy}
                onClick={() => actions.onRead!(item)}
              />
            )}
            {!editable ? null : (
              <LineAction
                label="Edit"
                icon="Edit"
                expanded={editing}
                className={editing ? "bg-accent text-foreground" : undefined}
                disabled={busy}
                onClick={() => setEditing((open) => !open)}
              />
            )}
            {!editable || postpone === null ? null : (
              <PostponeMenu
                target={postpone}
                now={now}
                disabled={busy}
                working={pending === "postpone"}
                onPostpone={(day) => actions!.onPostpone(item, day)}
              />
            )}
            {actions === undefined || !unread ? null : (
              <LineAction
                label="Mark read"
                icon="MailOpen"
                ariaLabel={`Mark "${item.title}" read`}
                disabled={busy}
                working={pending === "read" ? PENDING_LABEL.read : null}
                onClick={() => actions.onMarkRead(item)}
              />
            )}
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
            {item.context === null || github !== null ? null : <span className="ml-auto truncate">{item.context}</span>}
          </div>
          {card}
          {editable && editing ? (
            <TaskEdit
              key={item.id}
              item={item}
              now={now}
              projects={projects}
              busy={pending === "save" || pending === "delete"}
              onCancel={() => setEditing(false)}
              onDelete={() => actions!.onDelete(item)}
              onSave={async (draft) => {
                const saved = await actions!.onEdit(item, draft);
                if (saved) setEditing(false);
                return saved;
              }}
            />
          ) : null}
          {replying && actions !== undefined && item.github !== null ? (
            <ReplyBox item={item} onReply={actions.onReply} onClose={() => setReplying(false)} />
          ) : null}
        </div>
      </div>
    </li>
  );
}
