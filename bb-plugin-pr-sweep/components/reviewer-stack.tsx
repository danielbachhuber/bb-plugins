// The same avatars GitHub Context draws in its banner, copied rather than
// imported so the row does not depend on that plugin's components.
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Reviewer, ReviewState } from "../sweep/row-status.js";

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

/** The avatar, or the account's initial when GitHub has no image for it (a bot, say). */
function Avatar({ reviewer }: { reviewer: Reviewer }) {
  const [failed, setFailed] = useState(false);
  const shape = reviewer.team ? "rounded-[4px]" : "rounded-full";
  const ring = "outline outline-2 outline-[var(--color-card,white)]";
  if (failed) {
    const name = reviewer.team ? (reviewer.login.split("/")[1] ?? reviewer.login) : reviewer.login;
    return (
      <span
        className={cn(
          "flex size-[18px] items-center justify-center bg-surface-selected text-[9px] font-semibold uppercase leading-none text-foreground",
          shape,
          ring,
        )}
      >
        {name[0]}
      </span>
    );
  }
  return (
    <img
      src={reviewer.avatarUrl}
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

/** One reviewer, with their name and review in a tooltip on hover. */
function Named({ reviewer, children }: { reviewer: Reviewer; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">
        <span className="font-medium">
          {reviewer.team ? "@" : ""}
          {reviewer.login}
        </span>{" "}
        {STATE_LABEL[reviewer.state]}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Each reviewer's avatar with a badge for where their review stands. Hovering
 * an avatar names the reviewer and their review. The caller draws the case
 * with nobody asked.
 */
export function ReviewerStack({ reviewers }: { reviewers: Reviewer[] }) {
  const summary = reviewers.map(describe).join(", ");
  return (
    <TooltipProvider delayDuration={150}>
      <span role="img" className="flex shrink-0 items-center gap-0.5" aria-label={`Reviewers: ${summary}`}>
        {reviewers.map((reviewer) => (
          <Named key={reviewer.login} reviewer={reviewer}>
            <span className="relative flex">
              <Avatar reviewer={reviewer} />
              <span className="absolute -bottom-1 -right-1.5 flex rounded-full bg-card p-px">
                <StateBadge state={reviewer.state} />
              </span>
            </span>
          </Named>
        ))}
      </span>
    </TooltipProvider>
  );
}
