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
import { describeActivity, describeDue, type DueTone } from "./due.js";
import { snoozeChoices } from "./snooze.js";
import type { GitHubPart, Item } from "./types.js";

export interface RowActions {
  onSnooze: (item: Item, until: string) => void;
  onUnsnooze: (item: Item) => void;
  onArchive: (item: Item) => void;
  onComplete: (item: Item) => void;
  /** Resolves true once the comment is posted, so the box can close. */
  onReply: (item: Item, body: string) => Promise<boolean>;
  onStartThread: (item: Item) => void;
  onOpenThread: (threadId: string) => void;
}

const DUE_TONE: Record<DueTone, string> = {
  overdue: "text-destructive-text",
  today: "text-success",
  upcoming: "text-muted-foreground",
};

/** Which source a row came from, drawn at the head of its row. */
function brandOf(item: Item): Brand | null {
  if (item.github !== null) return "github";
  if (item.source === "todoist") return "todoist";
  if (item.source === "gmail") return "gmail";
  return null;
}

const PRIORITY: Record<1 | 2 | 3, string> = {
  1: "border-destructive/40 text-destructive-text",
  2: "border-warning/40 text-warning-text",
  3: "border-border text-foreground",
};

/** A merged or closed pull request, or a closed issue, has nothing left to do. */
export function suggestsArchive(item: Item): boolean {
  return item.gmail !== null && (item.github?.state === "merged" || item.github?.state === "closed");
}

function Chip({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={cn("mt-0.5 shrink-0 rounded border px-1.5 text-[11px] leading-4", className)}>{children}</span>
  );
}

/**
 * GitHub's own state colors, light and dark, so a label reads the way it does
 * on github.com. bb's theme has no purple, and these are GitHub's meaning
 * rather than the app's, so they are GitHub's values rather than bb tokens.
 */
const GITHUB_STATE = {
  open: "bg-[#1f883d] dark:bg-[#238636]",
  draft: "bg-[#59636e] dark:bg-[#656c76]",
  merged: "bg-[#8250df] dark:bg-[#8957e5]",
  closed: "bg-[#cf222e] dark:bg-[#da3633]",
  done: "bg-[#8250df] dark:bg-[#8957e5]",
  notPlanned: "bg-[#59636e] dark:bg-[#656c76]",
} as const;

/** GitHub's text colors for review states, which it draws as outlined labels. */
const GITHUB_REVIEW = {
  requested: "border-[#9a6700]/40 text-[#9a6700] dark:border-[#d29922]/40 dark:text-[#d29922]",
  changes: "border-[#cf222e]/40 text-[#cf222e] dark:border-[#f85149]/40 dark:text-[#f85149]",
  approved: "border-[#1a7f37]/40 text-[#1a7f37] dark:border-[#3fb950]/40 dark:text-[#3fb950]",
} as const;

/** The merged-purple an Archive suggestion is tinted with. */
const SUGGESTED = "text-[#8250df] hover:text-[#8250df] dark:text-[#a371f7] dark:hover:text-[#a371f7]";

function stateLabel(github: GitHubPart): { label: string; icon: IconName; className: string } | null {
  const pull = github.kind === "pull";
  switch (github.state) {
    case "open":
      return { label: "Open", icon: pull ? "GitPullRequest" : "Circle", className: GITHUB_STATE.open };
    case "draft":
      return { label: "Draft", icon: "GitPullRequestDraft", className: GITHUB_STATE.draft };
    case "merged":
      return { label: "Merged", icon: "GitMerge", className: GITHUB_STATE.merged };
    case "closed":
      if (pull) return { label: "Closed", icon: "GitPullRequestClosed", className: GITHUB_STATE.closed };
      return github.closedAs === "not_planned"
        ? { label: "Not planned", icon: "CircleX", className: GITHUB_STATE.notPlanned }
        : { label: "Closed", icon: "CircleCheck", className: GITHUB_STATE.done };
    default:
      return null;
  }
}

/** The pull request or issue's state now, and what it is waiting on. */
function GitHubState({ github }: { github: GitHubPart }) {
  const state = stateLabel(github);
  const settled = github.state === "merged" || github.state === "closed";
  return (
    <>
      {github.reason === "review_requested" && !settled ? (
        <Chip className={GITHUB_REVIEW.requested}>Review requested</Chip>
      ) : null}
      {github.review === "changes_requested" ? <Chip className={GITHUB_REVIEW.changes}>Changes requested</Chip> : null}
      {github.review === "approved" ? <Chip className={GITHUB_REVIEW.approved}>Approved</Chip> : null}
      {state === null ? null : (
        <span
          className={cn(
            "mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium leading-4 text-white",
            state.className,
          )}
        >
          <Icon name={state.icon} className="size-3" />
          {state.label}
        </span>
      )}
    </>
  );
}

function SnoozeMenu({ item, until, now, actions }: { item: Item; until: string | null; now: Date; actions: RowActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          aria-label={until === null ? `Snooze "${item.title}"` : `Unsnooze "${item.title}"`}
        >
          <Icon name="Pause" className="size-4" />
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
}

/** A small labelled button in the details line, for the row's own action. */
function LineAction({
  label,
  icon,
  hoverIcon,
  onClick,
  className,
  ariaLabel,
  expanded,
}: {
  label: string;
  icon: IconName;
  /** Drawn instead of `icon` on hover, as Complete's circle fills with a check. */
  hoverIcon?: IconName;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group/action -mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground",
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

/**
 * The one date the left column shows under the source's icon: when it is
 * due, else its deadline, else when it last had activity, such as an email's
 * arrival.
 */
function leadingDate(item: Item, now: Date): { text: string; className: string; icon: IconName | null } | null {
  if (item.due !== null) {
    const due = describeDue(item.due, now);
    return { text: due.text, className: DUE_TONE[due.tone], icon: item.due.recurring ? "Repeat" : null };
  }
  if (item.deadline !== null) {
    const deadline = describeDue({ date: item.deadline, recurring: false }, now);
    return { text: deadline.text, className: DUE_TONE[deadline.tone], icon: "Target" };
  }
  if (item.activityAt !== null) return { text: describeActivity(item.activityAt, now), className: "", icon: null };
  return null;
}

export function ItemRow({ item, now, actions, snoozedUntil = null, threadId = null }: ItemRowProps) {
  const [replying, setReplying] = useState(false);
  const date = leadingDate(item, now);
  // Shown in the details line only when the left column is showing the due date instead.
  const deadline =
    item.due !== null && item.deadline !== null ? describeDue({ date: item.deadline, recurring: false }, now) : null;
  const brand = brandOf(item);
  const archiveSuggested = suggestsArchive(item);
  const comment = item.github?.comment ?? null;

  return (
    <li className="py-3.5 text-sm">
      <div className="flex items-start gap-3">
        {/* Where it is from and when it is for, in a column of its own so every title starts at one edge. */}
        <div className="flex w-14 shrink-0 flex-col gap-1 pt-0.5 text-xs leading-tight text-muted-foreground">
          {brand === null ? <span className="size-4" /> : <BrandIcon brand={brand} className="size-4" />}
          {date === null ? null : (
            <span className={cn("inline-flex flex-wrap items-center gap-x-1", date.className)}>
              {date.icon === "Target" ? <Icon name="Target" className="size-3 shrink-0" aria-label="Deadline" /> : null}
              {date.text}
              {date.icon === "Repeat" ? <Icon name="Repeat" className="size-3 shrink-0" aria-label="Recurring" /> : null}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <UrlLink href={item.url} className="min-w-0 flex-1 text-foreground hover:underline">
              {item.title}
            </UrlLink>
            {item.github === null ? null : <GitHubState github={item.github} />}
            {item.priority === null ? null : (
              <Chip className={cn("font-mono", PRIORITY[item.priority])}>P{item.priority}</Chip>
            )}
          </div>
          {item.description === "" ? null : (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          )}
          {comment === null ? null : (
            <p className="mt-1 line-clamp-2 border-l-2 border-border pl-2 text-xs text-foreground/80">
              {comment.author === null ? null : <span className="font-medium">{comment.author}: </span>}
              {comment.text}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {actions === undefined ? null : item.source === "todoist" ? (
              <LineAction
                label="Complete"
                icon="Circle"
                hoverIcon="CircleCheck"
                ariaLabel={`Complete "${item.title}"`}
                onClick={() => actions.onComplete(item)}
              />
            ) : item.gmail !== null ? (
              <LineAction
                label={archiveSuggested ? `Archive, it's ${item.github?.state}` : "Archive"}
                icon="Archive"
                ariaLabel={`Archive "${item.title}"`}
                className={archiveSuggested ? SUGGESTED : undefined}
                onClick={() => actions.onArchive(item)}
              />
            ) : null}
            {actions === undefined || item.github === null ? null : (
              <LineAction
                label="Reply"
                icon="ArrowTurnBackward"
                expanded={replying}
                onClick={() => setReplying((open) => !open)}
              />
            )}
            {actions === undefined ? null : threadId === null ? (
              <LineAction label="Start thread" icon="MessageSquarePlus" onClick={() => actions.onStartThread(item)} />
            ) : (
              <LineAction label="Open thread" icon="MessageSquare" onClick={() => actions.onOpenThread(threadId)} />
            )}
            {deadline === null ? null : (
              <span className={cn("inline-flex items-center gap-1", DUE_TONE[deadline.tone])}>
                <Icon name="Target" className="size-3" />
                Deadline {deadline.text}
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
            {item.context === null ? null : <span className="ml-auto truncate">{item.context}</span>}
          </div>
          {replying && actions !== undefined && item.github !== null ? (
            <ReplyBox item={item} onReply={actions.onReply} onClose={() => setReplying(false)} />
          ) : null}
        </div>

        {actions === undefined ? null : (
          <div className="-mr-1.5 shrink-0">
            <SnoozeMenu item={item} until={snoozedUntil} now={now} actions={actions} />
          </div>
        )}
      </div>
    </li>
  );
}
