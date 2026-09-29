// What PR Sweep and Review Sweep both draw for a pull request: its state icon,
// its reviewers, its checks, and its size. The data each needs is typed here
// too, so the two plugins describe a pull request the same way.
import { Fragment, useState, type ComponentType, type ReactElement, type ReactNode } from "react";

import { Icon } from "./icons";
import { cn } from "./lib/cn";

export type ReviewState = "approved" | "changes_requested" | "commented" | "dismissed" | "pending";

export interface Reviewer {
  /** A user's login, or a team's `org/team` slug. */
  login: string;
  state: ReviewState;
  team: boolean;
  avatarUrl: string;
}

/** A pull request's checks on its head commit, counted by outcome. */
export interface ChecksSummary {
  pass: number;
  fail: number;
  skip: number;
  pending: number;
  cancelled: number;
  total: number;
}

/** GitHub's picture for a user or organization. */
export function githubAvatar(owner: string): string {
  return `https://github.com/${encodeURIComponent(owner)}.png?size=40`;
}

export type ChecksGlyph = { tone: "passed" | "failed" | "running"; text: string };

/**
 * The checks as a count: failing out of those that ran when any fail, then
 * cancelled when any were, otherwise passing out of those that ran. Skipped
 * checks are left out of both. Null when nothing ran.
 */
export function checksGlyph(checks: ChecksSummary): ChecksGlyph | null {
  const ran = checks.total - checks.skip;
  if (ran <= 0) return null;
  if (checks.fail > 0) return { tone: "failed", text: `${checks.fail}/${ran} failing` };
  if (checks.cancelled > 0) return { tone: "failed", text: `${checks.cancelled}/${ran} cancelled` };
  return { tone: checks.pending > 0 ? "running" : "passed", text: `${checks.pass}/${ran}` };
}

/** Checks, most consequential count first, with zeroes left out: "2 fail, 7 pass". */
export function checksLabel(checks: ChecksSummary): string {
  const parts: string[] = [];
  if (checks.fail) parts.push(`${checks.fail} fail`);
  if (checks.pending) parts.push(`${checks.pending} running`);
  if (checks.cancelled) parts.push(`${checks.cancelled} cancelled`);
  if (checks.pass) parts.push(`${checks.pass} pass`);
  if (checks.skip) parts.push(`${checks.skip} skip`);
  return parts.length ? parts.join(", ") : "no checks";
}

/** Green for an open pull request, muted for a draft. */
export function PullRequestIcon({ draft }: { draft: boolean }) {
  return draft ? (
    <Icon name="GitPullRequestDraft" label="Draft pull request" className="size-4 text-muted-foreground" />
  ) : (
    <Icon name="GitPullRequestArrow" label="Open pull request" className="size-4 text-success" />
  );
}

const STATE_LABEL: Record<ReviewState, string> = {
  approved: "approved",
  changes_requested: "requested changes",
  commented: "commented",
  dismissed: "review dismissed",
  pending: "review pending",
};

/** GitHub's own colours for each review state. */
const STATE_FILL: Record<ReviewState, string> = {
  approved: "#1a7f37",
  changes_requested: "#cf222e",
  commented: "#6e7781",
  dismissed: "#6e7781",
  pending: "#d4a72c",
};

/** A filled disc with a white glyph for a review state. */
function StateBadge({ state }: { state: ReviewState }) {
  const glyph =
    state === "approved" ? (
      <path d="M3 5.2 4.4 6.6 7.2 3.6" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    ) : state === "changes_requested" ? (
      <path d="M3.4 3.4 6.6 6.6M6.6 3.4 3.4 6.6" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    ) : state === "commented" ? (
      <path d="M2.8 3.2h4.4v2.8H4.8L3.6 7.1V6H2.8z" fill="white" />
    ) : state === "dismissed" ? (
      <path d="M3.2 5h3.6" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    ) : (
      <circle cx="5" cy="5" r="1.4" fill="white" />
    );
  return (
    <svg viewBox="0 0 10 10" className="size-2.5 shrink-0" aria-hidden="true">
      <circle cx="5" cy="5" r="5" fill={STATE_FILL[state]} />
      {glyph}
    </svg>
  );
}

/**
 * A person's or organization's picture, or the name's first letter when
 * GitHub has no image for it (a bot, say). Square for a team or organization.
 */
export function Avatar({ login, avatarUrl, square = false }: { login: string; avatarUrl: string; square?: boolean }) {
  const [failed, setFailed] = useState(false);
  const shape = square ? "rounded-[4px]" : "rounded-full";
  const ring = "outline outline-2 outline-[var(--color-card,white)]";
  if (failed) {
    return (
      <span
        className={cn(
          "flex size-[18px] items-center justify-center bg-surface-selected text-[9px] font-semibold uppercase leading-none text-foreground",
          shape,
          ring,
        )}
      >
        {login[0]}
      </span>
    );
  }
  return (
    <img
      src={avatarUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("size-[18px] bg-surface-selected object-cover", shape, ring)}
    />
  );
}

function describe(reviewer: Reviewer): string {
  return `${reviewer.team ? "@" : ""}${reviewer.login} ${STATE_LABEL[reviewer.state]}`;
}

/**
 * The hover label on one avatar. A plugin passes a wrapper around its own
 * tooltip, which this package cannot import because the tooltip's portal
 * belongs to the plugin; without one, the avatar gets a native `title`.
 */
export interface ReviewerTooltipProps {
  label: ReactNode;
  children: ReactElement;
}

export interface ReviewerStackProps {
  reviewers: Reviewer[];
  Tooltip?: ComponentType<ReviewerTooltipProps>;
}

/**
 * Each reviewer's avatar with a badge for where their review stands. Hovering
 * an avatar names the reviewer and their review. The caller draws the case
 * with nobody asked.
 */
export function ReviewerStack({ reviewers, Tooltip }: ReviewerStackProps) {
  const summary = reviewers.map(describe).join(", ");
  return (
    <span role="img" className="flex shrink-0 items-center gap-0.5" aria-label={`Reviewers: ${summary}`}>
      {reviewers.map((reviewer) => {
        const name = reviewer.team ? (reviewer.login.split("/")[1] ?? reviewer.login) : reviewer.login;
        const avatar = (
          <span className="relative flex" title={Tooltip ? undefined : describe(reviewer)}>
            <Avatar login={name} avatarUrl={reviewer.avatarUrl} square={reviewer.team} />
            <span className="absolute -bottom-1 -right-1.5 flex rounded-full bg-card p-px">
              <StateBadge state={reviewer.state} />
            </span>
          </span>
        );
        if (!Tooltip) return <Fragment key={reviewer.login}>{avatar}</Fragment>;
        return (
          <Tooltip
            key={reviewer.login}
            label={
              <>
                <span className="font-medium">
                  {reviewer.team ? "@" : ""}
                  {reviewer.login}
                </span>{" "}
                {STATE_LABEL[reviewer.state]}
              </>
            }
          >
            {avatar}
          </Tooltip>
        );
      })}
    </span>
  );
}

const CHECKS_TONE = {
  passed: "text-success",
  running: "text-amber-600/70 dark:text-amber-500/70",
  failed: "text-destructive-text",
} as const;

/**
 * The checks as an icon and a count, with every count in words on hover: a
 * green tick, an amber clock while any run, a red cross when any fail or were
 * cancelled. Nothing when the pull request has no checks.
 */
export function ChecksBadge({ checks }: { checks: ChecksSummary }) {
  const glyph = checksGlyph(checks);
  if (!glyph) return null;
  return (
    <span data-part="checks" className="inline-flex items-center gap-1" title={checksLabel(checks)}>
      <Icon
        name={glyph.tone === "failed" ? "CircleX" : glyph.tone === "running" ? "Clock" : "CircleCheck"}
        className={cn("size-3.5", CHECKS_TONE[glyph.tone])}
      />
      <span className={glyph.tone === "failed" ? CHECKS_TONE.failed : undefined}>{glyph.text}</span>
    </span>
  );
}

/** Lines added in green and removed in red: "+128 −12", with a minus sign. */
export function DiffCount({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span data-part="diff" className="tabular-nums">
      <span className="text-success">+{additions}</span>{" "}
      <span className="text-destructive-text">−{deletions}</span>
    </span>
  );
}
