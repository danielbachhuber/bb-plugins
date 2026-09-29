import { githubAvatar, type Reviewer, type ReviewState } from "sweep-ui/pull-request";
import type { ListedPr } from "./tiers.js";

/**
 * What a pull request's row says about it beyond its title: the banner under
 * the title, the stage on the track that is holding it up, the reviewers, and
 * the size. The checks' count and the pieces both sweeps draw live in
 * sweep-ui/pull-request. Pure, and read only from what the sweep already
 * fetched.
 */

export type Banner = {
  tone: "blocked" | "ready";
  text: string;
  /** A second, lighter part after the text, such as who requested changes. */
  detail?: string;
};

/** The flags after a conflict and failing checks that stop the author, in plain words. */
const OTHER_BLOCKERS: Record<string, string> = {
  "merge-blocked": "Merge blocked",
  "mergeable-unknown": "Mergeability unknown",
  "ci-cancelled": "Checks cancelled",
  "ci-absent": "No checks",
  "no-reviewer": "No reviewer",
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The one flag that stops the pull request most: a merge conflict, then
 * failing checks, then the first other blocker in the order the classifier
 * ranks them. The banner leads with it and the track crosses out its stage,
 * so the two always point at the same problem.
 */
function leadingBlocker(flags: readonly string[]): string | null {
  if (flags.includes("conflict")) return "conflict";
  if (flags.includes("ci-failing")) return "ci-failing";
  return flags.find((flag) => flag in OTHER_BLOCKERS) ?? null;
}

/**
 * Comments that are yours to answer: unresolved inline threads and reviews
 * with a written body. Null when there are none.
 */
function commentsText(row: ListedPr): string | null {
  const parts: string[] = [];
  if (row.unresolvedThreads > 0) parts.push(plural(row.unresolvedThreads, "unresolved comment"));
  if (row.notedBy.length > 0) parts.push(`Review notes from ${row.notedBy.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * What stops the pull request, in red, or "Ready to merge" in green. Reviewer
 * feedback follows the leading blocker as a lighter detail, naming the
 * reviewer who requested changes when the sweep knows who. With nothing else
 * to say, comments left to answer are the banner, since they are what puts a
 * row with no flags under needs you.
 */
export function bannerFor(row: ListedPr): Banner | null {
  const flags = row.flags;
  const leading = leadingBlocker(flags);
  const main =
    leading === "conflict"
      ? row.baseRefName
        ? `Merge conflict with ${row.baseRefName}`
        : "Merge conflict"
      : leading === "ci-failing"
        ? plural(row.checks.fail, "failing check")
        : leading
          ? OTHER_BLOCKERS[leading]!
          : null;

  if (flags.includes("feedback")) {
    const by = row.changesRequestedBy?.[0];
    if (main) return { tone: "blocked", text: main, detail: by ? `${by} requested changes` : "reviewer feedback" };
    return { tone: "blocked", text: by ? `${by} requested changes` : "Reviewer feedback" };
  }
  if (main) return { tone: "blocked", text: main };
  if (flags.includes("merge-ready")) return { tone: "ready", text: "Ready to merge" };
  const comments = commentsText(row);
  if (comments) return { tone: "blocked", text: comments };
  return null;
}

/** The track's stages: Draft, Checks, Review, Merge. */
const CHECKS = 1;
const MERGE = 3;

const BLOCKED_STAGE: Record<string, number> = {
  conflict: MERGE,
  "ci-failing": CHECKS,
  "merge-blocked": MERGE,
  "ci-cancelled": CHECKS,
};

/**
 * The stage drawn with a red cross: the stage of the problem the banner leads
 * with, or none when that problem has no stage of its own.
 */
export function blockedStageOf(row: ListedPr): number | null {
  const leading = leadingBlocker(row.flags);
  return leading === null ? null : (BLOCKED_STAGE[leading] ?? null);
}

/**
 * Everyone asked for a review or who gave one, once each. A reviewer asked
 * again is pending whatever they said before, since that is what the author is
 * waiting on; otherwise requested changes, then an approval, then a comment,
 * because everyone who reviewed counts as a commenter too.
 */
export function reviewersFor(row: ListedPr, avatarFor: (owner: string) => string = githubAvatar): Reviewer[] {
  const states = new Map<string, ReviewState>();
  const add = (logins: readonly string[] | undefined, state: ReviewState) => {
    for (const login of logins ?? []) if (!states.has(login)) states.set(login, state);
  };
  add(row.waitingOn, "pending");
  add(row.changesRequestedBy, "changes_requested");
  add(row.approvedBy, "approved");
  add(row.commentedBy, "commented");

  return [...states].map(([login, state]) => {
    const team = login.includes("/");
    // A team has no picture of its own, so it shows its organization's.
    const owner = team ? login.split("/")[0]! : login;
    return { login, state, team, avatarUrl: avatarFor(owner) };
  });
}

/** Lines added and removed, or null for a row stored before the sweep read them. */
export function diffOf(row: ListedPr): { additions: number; deletions: number } | null {
  if (typeof row.additions !== "number" || typeof row.deletions !== "number") return null;
  return { additions: row.additions, deletions: row.deletions };
}
