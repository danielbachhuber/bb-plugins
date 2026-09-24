// A GitHub row's pull request or issue, drawn in GitHub Context's banner
// chrome (bb-plugin-gh-context/components/context-banner.tsx), whose classes
// are bb's own prompt-stack classes: one card, a segment for the pull request
// with its state icon and check glyph, and Merge on the right.
import type { ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import { GithubFaviconIcon, type GithubCheckStatus } from "./github-favicon-icon.js";
import type { GitHubPart } from "./types.js";

const CARD_CLASS = "rounded-lg border border-border bg-surface-raised-solid overflow-hidden";
const ROW_CLASS = "flex items-center gap-0.5 p-1 text-xs text-muted-foreground";
const SEGMENT_CLASS =
  "flex min-h-6 min-w-0 items-center gap-1.5 overflow-hidden rounded px-2 py-1 text-xs text-muted-foreground no-underline transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const STATE_ICON: Record<"open" | "draft" | "merged" | "closed", { icon: IconName; className: string; label: string }> = {
  open: { icon: "GitPullRequestArrow", className: "text-success", label: "Open" },
  draft: { icon: "GitPullRequestDraft", className: "text-muted-foreground", label: "Draft" },
  merged: { icon: "GitMerge", className: "text-pr-merged", label: "Merged" },
  closed: { icon: "GitPullRequestClosed", className: "text-destructive", label: "Closed" },
};

const CHECK_STATUS: Record<NonNullable<GitHubPart["checks"]>, GithubCheckStatus> = {
  passing: "success",
  failing: "failure",
  pending: "pending",
};

function issueIcon(github: GitHubPart): { icon: IconName; className: string; label: string } {
  if (github.state === "closed") {
    return github.closedAs === "not_planned"
      ? { icon: "CircleX", className: "text-muted-foreground", label: "Not planned" }
      : { icon: "CircleCheck", className: "text-pr-merged", label: "Closed" };
  }
  return { icon: "Circle", className: "text-success", label: "Open" };
}

/** What the pull request is waiting on, in the banner's words. */
function reviewLabel(github: GitHubPart, yours: boolean): string | null {
  if (github.state === "merged" || github.state === "closed") return null;
  if (yours) return "Review requested";
  if (github.reviewRequested === "team") return "Team review requested";
  if (github.review === "changes_requested") return "Changes requested";
  if (github.review === "approved") return "Approved";
  return null;
}

export function PullRequestSegment({ github, url, yours }: { github: GitHubPart; url: string; yours: boolean }) {
  const pull = github.kind === "pull";
  const state = pull ? STATE_ICON[github.state ?? "open"] : issueIcon(github);
  const settled = github.state === "merged" || github.state === "closed";
  const checks = pull && !settled && github.checks != null ? CHECK_STATUS[github.checks] : null;
  const labels = [github.state !== "open" && github.state !== null ? state.label : null, reviewLabel(github, yours)].filter(Boolean);
  return (
    <UrlLink href={url} className={cn(SEGMENT_CLASS, "shrink-0")}>
      <span className="flex h-4 shrink-0 items-center gap-1" title={`${state.label} ${pull ? "pull request" : "issue"}`}>
        <Icon name={state.icon} className={cn("size-4 shrink-0", state.className)} aria-hidden="true" />
        {checks === null ? null : <GithubFaviconIcon status={checks} />}
      </span>
      <span className="truncate">
        {github.repo}#{github.number}
        {labels.map((label) => ` · ${label}`).join("")}
      </span>
    </UrlLink>
  );
}

export function PullRequestBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className={CARD_CLASS}>
      <div className={ROW_CLASS}>
        {left}
        {right == null ? null : <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1 pr-1">{right}</div>}
      </div>
    </div>
  );
}
