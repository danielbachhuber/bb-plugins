import {
  groupForRow,
  type ChecksSummary,
  type ClassifiedRow,
  type RawPullRequest,
  type RawReviewRequestedEvent,
  type RawStateCount,
  type ReviewState,
  type ReviewerState,
  type RowReviewer,
} from "./types.js";

/** Epoch ms, or null for a missing or unparseable timestamp. */
export function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/** A review that was actually submitted. PENDING reviews are drafts, not looks. */
const SUBMITTED_STATES = new Set(["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"]);

/**
 * The last time you submitted a review on this pull request, or null.
 *
 * DISMISSED counts: a dismissed approval still means you read the diff once,
 * which is what separates a re-review from a first look.
 */
export function lastReviewedAt(pr: RawPullRequest, viewer: string): number | null {
  let latest: number | null = null;
  for (const review of pr.reviews?.nodes ?? []) {
    if (!review || review.author?.login !== viewer) continue;
    if (!SUBMITTED_STATES.has((review.state ?? "").toUpperCase())) continue;
    const at = parseTime(review.submittedAt);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/**
 * When the review became yours, as a three-step fallback so a missing timeline
 * degrades instead of throwing.
 *
 * 1. The newest request naming you directly. Exact.
 * 2. The newest request of any kind. Covers a request that reached you through
 *    a team, where the event names the team and never your login — the search
 *    query already guarantees you are a requested reviewer, so the most recent
 *    request is the one that put you here.
 * 3. The pull request's own creation time, for a PR whose timeline window
 *    (`last: N`) did not reach back far enough to include the event.
 */
export function requestedAt(pr: RawPullRequest, viewer: string): number {
  const events = (pr.timelineItems?.nodes ?? []).filter(
    (node): node is RawReviewRequestedEvent => Boolean(node),
  );

  const newest = (candidates: RawReviewRequestedEvent[]): number | null => {
    let latest: number | null = null;
    for (const event of candidates) {
      const at = parseTime(event.createdAt);
      if (at !== null && (latest === null || at > latest)) latest = at;
    }
    return latest;
  };

  const direct = newest(events.filter((event) => event.requestedReviewer?.login === viewer));
  if (direct !== null) return direct;

  const any = newest(events);
  if (any !== null) return any;

  return parseTime(pr.createdAt) ?? 0;
}

/**
 * Who still owes a review, you first and the rest alphabetical.
 *
 * Reads `reviewRequests`, which is the set of requests still outstanding — not
 * the `ReviewRequestedEvent` timeline above, which is a history and includes
 * requests already answered or withdrawn.
 *
 * Your own entry becomes "you". A team is named by its slug, which is the
 * useful case: it tells you a teammate could take this one instead.
 */
export function requestedReviewers(pr: RawPullRequest, viewer: string): string[] {
  const others = new Set<string>();
  let includesViewer = false;

  for (const request of pr.reviewRequests?.nodes ?? []) {
    const reviewer = request?.requestedReviewer;
    if (!reviewer) continue;
    if (reviewer.login === viewer) {
      includesViewer = true;
      continue;
    }
    const name = reviewer.login ?? reviewer.slug;
    if (name) others.add(name);
  }

  return [...(includesViewer ? ["you"] : []), ...[...others].sort()];
}

/**
 * A re-review is a review you have already done that came back to you: your
 * last submitted review predates the current request. Reviewing and then being
 * re-requested is the case GitHub's own views lose most easily, and it is
 * usually the cheapest row in the queue to clear.
 *
 * The comparison is against `requested`, not "has any review": a PR you
 * reviewed *after* the last request is not waiting on you at all, and reading
 * it as a first look would be worse than reading it as a re-review.
 */
export function reviewState(reviewed: number | null, requested: number): ReviewState {
  return reviewed !== null && reviewed < requested ? "re-review" : "first-look";
}

/**
 * The newest request naming the viewer directly, or null when every request
 * reached them through a team.
 */
export function directlyRequestedAt(pr: RawPullRequest, viewer: string): number | null {
  let latest: number | null = null;
  for (const node of pr.timelineItems?.nodes ?? []) {
    if (!node || node.requestedReviewer?.login !== viewer) continue;
    const at = parseTime(node.createdAt);
    if (at !== null && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

/**
 * True when the viewer has already answered the request that is putting this
 * pull request in front of them.
 *
 * `review-requested:@me` matches a request made to a team the viewer belongs
 * to, which is how most requests arrive in an org — so a pull request they
 * personally approved yesterday comes back the moment anyone adds that team.
 * Their review is the answer; a later request naming the team is not a new
 * question for them.
 *
 * A direct re-request is a new question, so that still counts as outstanding.
 */
export function hasAnswered(pr: RawPullRequest, viewer: string): boolean {
  const reviewed = lastReviewedAt(pr, viewer);
  if (reviewed === null) return false;

  const direct = directlyRequestedAt(pr, viewer);
  return direct === null || reviewed > direct;
}

type Outcome = Exclude<keyof ChecksSummary, "total">;

/**
 * A check run's state, as `checkRunCountsByState` names it. NEUTRAL counts as
 * skipped, as PR Sweep counts it, so one pull request shows the same count on
 * both tabs.
 */
const CHECK_RUN_OUTCOME: Record<string, Outcome> = {
  SUCCESS: "pass",
  NEUTRAL: "skip",
  SKIPPED: "skip",
  STALE: "skip",
  FAILURE: "fail",
  TIMED_OUT: "fail",
  ACTION_REQUIRED: "fail",
  STARTUP_FAILURE: "fail",
  CANCELLED: "cancelled",
  IN_PROGRESS: "pending",
  QUEUED: "pending",
  PENDING: "pending",
  WAITING: "pending",
  REQUESTED: "pending",
};

/** A commit status's state, as `statusContextCountsByState` names it. */
const STATUS_CONTEXT_OUTCOME: Record<string, Outcome> = {
  SUCCESS: "pass",
  FAILURE: "fail",
  ERROR: "fail",
  PENDING: "pending",
  EXPECTED: "pending",
};

/**
 * The head commit's checks, from the counts GitHub keeps per state. A state
 * this does not know counts as still running, as PR Sweep treats an
 * unrecognised conclusion, so it is never shown as a pass. All zero when the
 * commit has no checks or the rollup is missing.
 */
export function checksOf(pr: RawPullRequest): ChecksSummary {
  const summary: ChecksSummary = { pass: 0, fail: 0, skip: 0, pending: 0, cancelled: 0, total: 0 };
  const contexts = pr.commits?.nodes?.at(-1)?.commit?.statusCheckRollup?.contexts;
  const add = (counts: Array<RawStateCount | null> | null | undefined, outcomes: Record<string, Outcome>) => {
    for (const entry of counts ?? []) {
      const count = entry?.count ?? 0;
      if (count <= 0) continue;
      summary[outcomes[(entry?.state ?? "").toUpperCase()] ?? "pending"] += count;
      summary.total += count;
    }
  };
  add(contexts?.checkRunCountsByState, CHECK_RUN_OUTCOME);
  add(contexts?.statusContextCountsByState, STATUS_CONTEXT_OUTCOME);
  return summary;
}

/** Review states that settle where someone stands, as opposed to a comment. */
const VERDICTS: Record<string, ReviewerState> = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  DISMISSED: "dismissed",
};

/** The order reviewers are drawn in: whoever is still owed first. */
const REVIEWER_ORDER: ReviewerState[] = ["pending", "changes_requested", "approved", "commented", "dismissed"];

/**
 * Everyone else on the pull request, once each, and where their review stands.
 *
 * A request still outstanding is pending, whatever that reviewer said before,
 * since the author is waiting on it. A team is named `org/team`, with the
 * repository's owner as the organization, so it can show that organization's
 * picture. Otherwise a reviewer's latest approval, change request, or
 * dismissal decides, and a reviewer who only commented is a commenter: a
 * comment after an approval does not take the approval back.
 *
 * The viewer is left out, since every row already waits on them, and so is
 * the author, whose replies to review comments GitHub files as reviews.
 */
export function reviewersOf(pr: RawPullRequest, viewer: string): RowReviewer[] {
  const owner = (pr.repository?.nameWithOwner ?? "").split("/")[0] ?? "";
  const author = pr.author?.login;
  const states = new Map<string, { state: ReviewerState; team: boolean }>();

  for (const request of pr.reviewRequests?.nodes ?? []) {
    const reviewer = request?.requestedReviewer;
    if (!reviewer) continue;
    if (reviewer.login) {
      if (reviewer.login !== viewer) states.set(reviewer.login, { state: "pending", team: false });
    } else if (reviewer.slug) {
      states.set(`${owner}/${reviewer.slug}`, { state: "pending", team: true });
    }
  }

  const verdicts = new Map<string, ReviewerState>();
  const commented = new Set<string>();
  for (const review of pr.reviews?.nodes ?? []) {
    const login = review?.author?.login;
    if (!login || login === viewer || login === author) continue;
    const state = (review?.state ?? "").toUpperCase();
    const verdict = VERDICTS[state];
    // Nodes arrive oldest first, so the last verdict seen is the latest.
    if (verdict) verdicts.set(login, verdict);
    else if (state === "COMMENTED") commented.add(login);
  }
  for (const [login, state] of verdicts) if (!states.has(login)) states.set(login, { state, team: false });
  for (const login of commented) if (!states.has(login)) states.set(login, { state: "commented", team: false });

  return [...states]
    .map(([login, { state, team }]) => ({ login, state, team }))
    .sort((a, b) => REVIEWER_ORDER.indexOf(a.state) - REVIEWER_ORDER.indexOf(b.state));
}

/** Returns null for a node too incomplete to act on, rather than a broken row. */
export function classifyOne(pr: RawPullRequest, viewer: string): ClassifiedRow | null {
  const repo = pr.repository?.nameWithOwner;
  const number = pr.number;
  const url = pr.url;
  if (!repo || typeof number !== "number" || !url) return null;

  if (hasAnswered(pr, viewer)) return null;

  const reviewed = lastReviewedAt(pr, viewer);
  const requested = requestedAt(pr, viewer);

  return {
    repo,
    number,
    title: pr.title ?? "",
    url,
    author: pr.author?.login ?? "unknown",
    isDraft: pr.isDraft === true,
    state: reviewState(reviewed, requested),
    requestedAt: requested,
    lastReviewedAt: reviewed,
    requestedReviewers: requestedReviewers(pr, viewer),
    size: {
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
      changedFiles: pr.changedFiles ?? 0,
    },
    comments: pr.comments?.totalCount ?? 0,
    checks: checksOf(pr),
    reviewers: reviewersOf(pr, viewer),
  };
}

/**
 * Oldest request first. This is the opposite of pr-sweep, which sorts by worst
 * flag: nothing in a review queue is broken, so the only ordering that helps is
 * the one that surfaces whoever has been waiting longest on you.
 */
export function classify(prs: Array<RawPullRequest | null>, viewer: string): ClassifiedRow[] {
  return prs
    .flatMap((pr) => (pr ? (classifyOne(pr, viewer) ?? []) : []))
    .sort((a, b) => a.requestedAt - b.requestedAt || a.repo.localeCompare(b.repo) || a.number - b.number);
}

export { groupForRow };
