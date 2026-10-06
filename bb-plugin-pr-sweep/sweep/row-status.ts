import { githubAvatar, type Reviewer, type ReviewState } from "sweep-ui/pull-request";
import { unansweredThreads } from "./actions.js";
import type { ListedPr } from "./tiers.js";

/**
 * What a pull request's row says about it beyond its title: the banner under
 * the title, the stage on the track that is holding it up, the reviewers, and
 * the size. The checks' count and the pieces both sweeps draw live in
 * sweep-ui/pull-request. Pure, and read only from what the sweep already
 * fetched.
 */

export type Banner = {
  tone: "blocked" | "ready" | "info" | "muted";
  text: string;
  /** A second, lighter part after the text, such as who requested changes. */
  detail?: string;
  /**
   * The button at the banner's right end: dismiss the failing checks it
   * names, or undo that dismissal.
   */
  action?: "dismiss-checks" | "restore-checks";
};

/** The flags that stop the author, other than feedback, in the order the classifier ranks them. */
const BLOCKERS = new Set(["conflict", "ci-failing", "merge-blocked", "ci-cancelled", "ci-absent", "no-reviewer"]);

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "hubber", "hubber and octocat", "hubber, octocat, and hubot". */
function names(logins: readonly string[]): string {
  if (logins.length <= 2) return logins.join(" and ");
  return `${logins.slice(0, -1).join(", ")}, and ${logins.at(-1)}`;
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
  return flags.find((flag) => BLOCKERS.has(flag)) ?? null;
}

/** The leading blocker as a sentence about this pull request. */
function blockerText(row: ListedPr, flag: string): string {
  const ran = row.checks.total - row.checks.skip;
  switch (flag) {
    case "conflict":
      return row.baseRefName ? `Merge conflict with ${row.baseRefName}` : "Merge conflict";
    case "ci-failing":
      return `${row.checks.fail} of ${ran} checks failing`;
    case "ci-cancelled":
      return `${row.checks.cancelled} of ${ran} checks cancelled`;
    case "ci-absent":
      return "No checks ran on the latest push";
    case "no-reviewer":
      return "No reviewer requested";
    default:
      // merge-blocked: approved, green, and no conflict, yet GitHub refuses
      // the merge. The listing does not say which rule, so the banner says
      // what is known.
      return "Approved, but GitHub won't merge it";
  }
}

/**
 * The unresolved threads as a detail: how many are unanswered and how many you
 * replied to. Null when there are none.
 */
function threadsText(row: ListedPr): string | null {
  const unanswered = unansweredThreads(row);
  const replied = row.unresolvedThreads - unanswered;
  if (unanswered > 0 && replied > 0) return `${plural(unanswered, "unanswered comment")}, ${replied} replied`;
  if (unanswered > 0) return plural(unanswered, "unanswered comment");
  if (replied > 0) return `${plural(replied, "comment")} replied`;
  return null;
}

/**
 * What reviewers left for you to answer, or null. Who requested changes
 * leads. Otherwise everyone waiting on you: the last commenter on each
 * unanswered thread, most threads first, then reviewers whose review was a
 * comment, then reviewers who wrote notes. Named by what they left when that
 * is all one kind, and as "Comments from" when it is a mix.
 */
function feedbackText(row: ListedPr): { text: string; byReviewer: boolean } | null {
  const requested = row.changesRequestedBy ?? [];
  if (requested.length > 0) return { text: `${names(requested)} requested changes`, byReviewer: true };
  const settled = new Set([...row.approvedBy, ...requested]);
  const commented = row.flags.includes("feedback") ? row.commentedBy.filter((login) => !settled.has(login)) : [];
  const threads = row.unansweredBy ?? [];
  const people = [...new Set([...threads, ...commented, ...row.notedBy])];
  if (people.length > 0) {
    const approvedWithNotes = people.every((login) => row.notedBy.includes(login) && row.approvedBy.includes(login));
    const text = approvedWithNotes
      ? `${names(people)} approved with notes`
      : threads.length === 0 && row.notedBy.length === 0
        ? `${names(people)} left review comments`
        : threads.length === 0 && commented.length === 0
          ? `Review notes from ${names(people)}`
          : `Comments from ${names(people)}`;
    return { text, byReviewer: true };
  }
  const unanswered = unansweredThreads(row);
  if (unanswered > 0) return { text: plural(unanswered, "unanswered comment"), byReviewer: false };
  return null;
}

/** A red banner for a reviewer's feedback, with the threads as its detail when there are any. */
function withThreads(text: string, row: ListedPr): Banner {
  const detail = threadsText(row);
  return detail ? { tone: "blocked", text, detail } : { tone: "blocked", text };
}

/**
 * The banner under the title. Red for what stops the pull request, with the
 * reviewers' feedback after it as a lighter detail; red for feedback alone,
 * with the threads as its detail; green when it can merge; blue for
 * a wait that asks nothing of you but is worth knowing. Nothing for a draft,
 * a first review not yet given, or checks still running, which the track and
 * the icons already show.
 */
export function bannerFor(row: ListedPr): Banner | null {
  const flags = row.flags;
  const leading = leadingBlocker(flags);
  const feedback = feedbackText(row);

  if (leading) {
    const main = blockerText(row, leading);
    if (leading === "merge-blocked") {
      // Feedback left with the approval is the likelier thing to act on, and
      // the track's cross on Merge already says the merge is blocked.
      if (feedback?.byReviewer) return withThreads(feedback.text, row);
      return { tone: "blocked", text: main, detail: "a branch rule isn't met" };
    }
    const banner: Banner = feedback
      ? { tone: "blocked", text: main, detail: feedback.text }
      : { tone: "blocked", text: main };
    // Only a row that knows its commit and failing checks can be dismissed.
    if (leading === "ci-failing" && row.headSha && (row.failingChecks?.length ?? 0) > 0) {
      banner.action = "dismiss-checks";
    }
    return banner;
  }
  if (flags.includes("merge-ready")) {
    // Feedback left alongside the approval is still green, since GitHub would
    // merge it, but it replaces who approved so the comments are not hidden.
    if (feedback) {
      const threads = feedback.byReviewer ? threadsText(row) : null;
      return { tone: "ready", text: "Ready to merge", detail: threads ? `${feedback.text}, ${threads}` : feedback.text };
    }
    const waiting = row.waitingOn;
    const detail =
      waiting.length > 0
        ? `${names(waiting)} ${waiting.length === 1 ? "hasn't" : "haven't"} reviewed yet`
        : row.approvedBy.length > 0
          ? `approved by ${names(row.approvedBy)}`
          : undefined;
    return detail ? { tone: "ready", text: "Ready to merge", detail } : { tone: "ready", text: "Ready to merge" };
  }
  if (row.awaitingReReview && row.waitingOn.length > 0) {
    return { tone: "info", text: `Waiting on ${names(row.waitingOn)} to re-review` };
  }
  if (feedback) {
    // A reviewer's name leads, so the threads follow as the detail.
    return feedback.byReviewer ? withThreads(feedback.text, row) : { tone: "blocked", text: feedback.text };
  }
  if (flags.includes("mergeable-unknown")) return { tone: "info", text: "GitHub is still checking for conflicts" };
  const dismissed = row.dismissedChecks ?? [];
  if (dismissed.length > 0) {
    return { tone: "muted", text: `${names(dismissed)} failing`, detail: "dismissed", action: "restore-checks" };
  }
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
