import { useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GithubFaviconIcon, type GithubCheckStatus } from "./github-favicon-icon";
import { ReviewerStack } from "./reviewer-stack";
import type {
  ContextChanges,
  ContextIssue,
  ContextPullRequest,
  MergeMethod,
  MyReview,
  ThreadContext,
} from "../context/contract.js";

/**
 * What gh-context draws above the composer, from props alone.
 *
 * The classes are bb's own, copied from its prompt stack
 * (`PromptStackCard`, `ThreadPromptContextBanner`, `prompt-banner-actions`),
 * so the banner reads as part of bb rather than a plugin's approximation of
 * it. The banner uses bare chrome and draws its own card, because an empty
 * banner has to draw nothing at all while still carrying the marker that hides
 * bb's.
 */

const CARD_CLASS = "rounded-lg border border-border bg-surface-raised-solid overflow-hidden";
const ROW_CLASS = "flex items-center gap-0.5 p-1 text-xs text-muted-foreground";
const SEGMENT_CLASS =
  "flex min-h-6 min-w-0 items-center gap-1.5 overflow-hidden rounded px-2 py-1 text-xs text-muted-foreground no-underline transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const ACTION_INTERACTIVE_CLASS =
  "cursor-pointer text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";
const ACTION_BUTTON_CLASS = cn(
  "inline-flex items-center whitespace-nowrap rounded border border-border bg-background px-1.5 py-0.5 text-xs shadow-xs",
  ACTION_INTERACTIVE_CLASS,
);

const PR_STATE_ICON: Record<ContextPullRequest["state"], { icon: IconName; className: string; label: string }> = {
  open: { icon: "GitPullRequestArrow", className: "text-success", label: "Open" },
  draft: { icon: "GitPullRequestDraft", className: "text-muted-foreground", label: "Draft" },
  merged: { icon: "GitMerge", className: "text-pr-merged", label: "Merged" },
  closed: { icon: "GitPullRequestClosed", className: "text-destructive", label: "Closed" },
};

/** bb's wording for each attention state, for the link's accessible name. */
const ATTENTION_LABEL: Record<ContextPullRequest["attention"], string> = {
  blocked: "Blocked",
  changes_requested: "Changes requested",
  checks_failed: "Checks failing",
  checks_pending: "Checks pending",
  closed: "Closed",
  conflicts: "Conflicts",
  draft: "Draft",
  merged: "Merged",
  none: "Open",
  ready_to_merge: "Ready to merge",
  review_requested: "Review requested",
};

const MY_REVIEW_LABEL: Record<MyReview, string> = {
  requested: "Review requested",
  "re-requested": "Re-review requested",
  approved: "You approved",
  changes_requested: "You requested changes",
  commented: "You commented",
  dismissed: "Your review was dismissed",
};

/** Reviews that answer the request: the thread's review is done. */
const REVIEWED: ReadonlySet<MyReview> = new Set(["approved", "changes_requested", "commented", "dismissed"]);

const MERGE_ACTIONS: readonly { method: MergeMethod; label: string }[] = [
  { method: "merge", label: "Merge" },
  { method: "squash", label: "Squash merge" },
  { method: "rebase", label: "Rebase and merge" },
];

function checkStatus(pullRequest: ContextPullRequest): GithubCheckStatus | null {
  if (pullRequest.state !== "open" && pullRequest.state !== "draft") return null;
  switch (pullRequest.checks?.state) {
    case "passing":
      return "success";
    case "failing":
      return "failure";
    case "pending":
      return "pending";
    default:
      return null;
  }
}

function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

function PullRequestSegment({ pullRequest, compact }: { pullRequest: ContextPullRequest; compact: boolean }) {
  const state = PR_STATE_ICON[pullRequest.state];
  const status = checkStatus(pullRequest);
  // Once merged or closed, that is the news; a review no longer is.
  const review =
    pullRequest.myReview && (pullRequest.state === "open" || pullRequest.state === "draft")
      ? MY_REVIEW_LABEL[pullRequest.myReview]
      : null;
  const labels = [pullRequest.state !== "open" ? state.label : null, review].filter(Boolean);
  return (
    <UrlLink
      href={pullRequest.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Pull request ${pullRequest.number}: ${[ATTENTION_LABEL[pullRequest.attention], review].filter(Boolean).join(", ")}`}
      className={cn(SEGMENT_CLASS, "shrink-0")}
    >
      <span className="flex h-4 shrink-0 items-center gap-1" title={`${state.label} pull request`}>
        <Icon name={state.icon} className={cn("size-4 shrink-0", state.className)} aria-hidden="true" />
        {status === null ? null : <GithubFaviconIcon status={status} />}
      </span>
      {compact ? null : (
        <span className="truncate">
          PR #{pullRequest.number}
          {labels.map((label) => ` · ${label}`).join("")}
        </span>
      )}
    </UrlLink>
  );
}

/**
 * Whether to draw the pull request's reviewers: always while it is open, and
 * after it has merged or closed only when someone reviewed it, since nobody
 * needs to be asked any more. Not when `gh` could not say who they are.
 */
function showReviewers(
  pullRequest: ContextPullRequest | null,
): pullRequest is ContextPullRequest & { reviewers: NonNullable<ContextPullRequest["reviewers"]> } {
  if (!pullRequest?.reviewers) return false;
  return pullRequest.state === "open" || pullRequest.state === "draft" || pullRequest.reviewers.length > 0;
}

function IssueSegment({ issue, compact }: { issue: ContextIssue; compact: boolean }) {
  const closed = issue.state === "closed";
  const why =
    issue.viaPullRequest !== null ? ` (via PR #${issue.viaPullRequest})` : "";
  return (
    <UrlLink
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Issue ${issue.number}${issue.title ? `: ${issue.title}` : ""}${why}`}
      title={`${issue.repo}#${issue.number}${issue.title ? ` ${issue.title}` : ""}${why}`}
      className={cn(SEGMENT_CLASS, compact && "shrink-0", closed && "opacity-60")}
    >
      <Icon
        name={closed ? "CircleCheck" : "Circle"}
        className={cn("size-3.5 shrink-0", closed ? "text-pr-merged" : "text-success")}
        aria-hidden="true"
      />
      <span className="shrink-0">#{issue.number}</span>
      {compact || !issue.title ? null : <span className="min-w-0 truncate">{issue.title}</span>}
    </UrlLink>
  );
}

function ChangesSegment({
  changes,
  compact,
  onOpen,
}: {
  changes: ContextChanges;
  compact: boolean;
  onOpen?: () => void;
}) {
  const files = `${formatCount(changes.files)} ${changes.files === 1 ? "file" : "files"}`;
  const content = (
    <>
      <Icon name="FileDiff" className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {compact ? null : `${changes.label} · `}
        {files},{" "}
        <span className="whitespace-nowrap">
          <span className="text-diff-added">+{formatCount(changes.insertions)}</span>{" "}
          <span className="text-diff-removed">-{formatCount(changes.deletions)}</span>
        </span>
      </span>
    </>
  );
  if (!onOpen) return <div className={cn(SEGMENT_CLASS, "hover:bg-transparent")}>{content}</div>;
  return (
    <button type="button" onClick={onOpen} className={cn(SEGMENT_CLASS, "cursor-pointer")}>
      {content}
    </button>
  );
}

function ActionButton({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn(ACTION_BUTTON_CLASS, className)} {...props} />;
}

function MergeSplitButton({
  disabled,
  method,
  onMethodChange,
  onMerge,
}: {
  disabled: boolean;
  method: MergeMethod;
  onMethodChange: (method: MergeMethod) => void;
  onMerge: (method: MergeMethod) => void;
}) {
  const selected = MERGE_ACTIONS.find((action) => action.method === method) ?? MERGE_ACTIONS[0]!;
  const segment = cn("px-1.5 py-0.5 text-xs focus-visible:z-10", ACTION_INTERACTIVE_CLASS);
  return (
    <div className="inline-flex overflow-hidden rounded border border-border bg-background shadow-xs">
      <button type="button" disabled={disabled} onClick={() => onMerge(selected.method)} className={segment}>
        {selected.label}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Choose pull request merge method"
            className={cn(
              segment,
              "inline-flex items-center border-l border-border px-1 data-[state=open]:bg-state-active data-[state=open]:text-foreground",
            )}
          >
            <Icon name="ChevronDown" className="size-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={2}>
          {MERGE_ACTIONS.map((action) => (
            <DropdownMenuItem
              key={action.method}
              onSelect={() => {
                onMethodChange(action.method);
                onMerge(action.method);
              }}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** bb's own skeleton block (`@bb/shared-ui/components/ui/skeleton`). */
function SkeletonBlock({ className }: { className: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-selected", className)} />;
}

/**
 * The banner's shape while its context loads: the same card and row height,
 * with a block where each segment and the merge button usually sit, so the
 * row is held open rather than appearing all at once.
 */
function LoadingRow({ compact }: { compact: boolean }) {
  return (
    <div className={ROW_CLASS} role="status" aria-busy="true" aria-label="Loading thread context">
      <div className="flex min-h-6 items-center gap-2 px-2 py-1">
        <SkeletonBlock className="h-4 w-14" />
        <SkeletonBlock className={compact ? "h-4 w-10" : "h-4 w-40"} />
        {compact ? null : <SkeletonBlock className="h-4 w-32" />}
      </div>
      <div className="ml-auto flex shrink-0 items-center pr-1">
        <SkeletonBlock className="h-5 w-24" />
      </div>
    </div>
  );
}

export interface ContextBannerProps {
  /** Null while it loads, which draws the skeleton. */
  context: ThreadContext | null;
  /** The prompt box's compact width: labels drop to icons, as bb's do. */
  compact?: boolean;
  /** Harvest's clock, drawn by the caller, which owns the Harvest client. */
  harvestSlot?: ReactNode;
  /** An action is in flight: the buttons are disabled until it settles. */
  pending?: boolean;
  initialMergeMethod?: MergeMethod;
  onMerge?: (method: MergeMethod) => void;
  onMarkReady?: () => void;
  /**
   * Offered when the thread's work is done: the pull request has merged, or
   * your review is in and nobody has asked for another.
   */
  onArchive?: () => void;
  onUnarchive?: () => void;
  onOpenChanges?: () => void;
  /**
   * A hidden element inside the banner's root, for a caller that measures the
   * prompt box around it: the root itself is `display: contents` and has no box.
   */
  measureRef?: Ref<HTMLSpanElement>;
}

export function ContextBanner({
  context,
  compact = false,
  harvestSlot,
  pending = false,
  initialMergeMethod = "squash",
  onMerge,
  onMarkReady,
  onArchive,
  onUnarchive,
  onOpenChanges,
  measureRef,
}: ContextBannerProps) {
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>(initialMergeMethod);

  const pullRequest = context?.pullRequest ?? null;
  const issues = context?.issues ?? [];
  const changes = context?.changes ?? null;
  const canMerge = pullRequest?.canMerge === true && pullRequest.state === "open" && onMerge;
  const canMarkReady = pullRequest?.canMerge === true && pullRequest.state === "draft" && onMarkReady;
  const canArchive =
    (pullRequest?.state === "merged" || (pullRequest?.myReview != null && REVIEWED.has(pullRequest.myReview))) &&
    onArchive;

  let body: ReactNode = null;
  if (context === null) {
    body = <LoadingRow compact={compact} />;
  } else if (context.archived) {
    body = (
      <div className={ROW_CLASS}>
        <div className={cn(SEGMENT_CLASS, "hover:bg-transparent")} role="status">
          <Icon name="Archive" className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Thread is archived</span>
        </div>
        {onUnarchive ? (
          <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
            <ActionButton disabled={pending} onClick={onUnarchive}>
              {pending ? "Unarchiving…" : "Unarchive"}
            </ActionButton>
          </div>
        ) : null}
      </div>
    );
  } else if (pullRequest || issues.length > 0 || changes || harvestSlot) {
    body = (
      <div className={ROW_CLASS}>
        {pullRequest ? <PullRequestSegment pullRequest={pullRequest} compact={compact} /> : null}
        {showReviewers(pullRequest) ? <ReviewerStack reviewers={pullRequest.reviewers} compact={compact} /> : null}
        {(compact ? issues.slice(0, 1) : issues).map((issue) => (
          <IssueSegment key={`${issue.repo}#${issue.number}`} issue={issue} compact={compact} />
        ))}
        {compact && issues.length > 1 ? (
          <span
            className="shrink-0 px-1 tabular-nums"
            title={issues.slice(1).map((issue) => `#${issue.number}`).join(", ")}
          >
            +{issues.length - 1}
          </span>
        ) : null}
        {/* At compact width a row with issues has no room left for the tally. */}
        {changes && !(compact && issues.length > 0) ? (
          <ChangesSegment changes={changes} compact={compact} onOpen={onOpenChanges} />
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1 pr-1">
          {canMerge ? (
            <MergeSplitButton
              disabled={pending}
              method={mergeMethod}
              onMethodChange={setMergeMethod}
              onMerge={onMerge}
            />
          ) : null}
          {canMarkReady ? (
            <ActionButton disabled={pending} onClick={onMarkReady}>
              Mark ready
            </ActionButton>
          ) : null}
          {canArchive ? (
            <ActionButton disabled={pending} onClick={onArchive}>
              {pending ? "Archiving…" : "Archive thread"}
            </ActionButton>
          ) : null}
          {/* Always rightmost, whatever actions sit beside it. */}
          {harvestSlot}
        </div>
      </div>
    );
  }

  return (
    <div
      className="contents"
      data-gh-context-banner=""
      // Hidden while loading too, on the default setting's assumption:
      // otherwise bb's banner shows under the skeleton and then vanishes.
      data-gh-context-hide={context === null || context.hide ? "" : undefined}
    >
      {measureRef ? <span hidden ref={measureRef} /> : null}
      {body ? <div className={CARD_CLASS}>{body}</div> : null}
    </div>
  );
}
