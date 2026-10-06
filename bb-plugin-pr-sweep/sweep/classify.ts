import {
  FLAG_SEVERITY,
  groupForFlags,
  type ChecksSummary,
  type ClassifiedRow,
  type Flag,
  type RawPullRequest,
} from "./types.js";

const SKIPPED_CONCLUSIONS = new Set(["SKIPPED", "NEUTRAL"]);
const FAILED_CONCLUSIONS = new Set(["FAILURE", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);

/**
 * A rollup mixes CheckRun entries (.status/.conclusion) with StatusContext
 * entries (.state). Reading .conclusion alone returns null for every status
 * context AND for every run still in progress, so both shapes are handled.
 */
type RollupEntry = NonNullable<RawPullRequest["statusCheckRollup"]>[number];

/** The later of two runs of the same check, undated entries sorting first. */
function isSameOrLater(candidate: RollupEntry, current: RollupEntry): boolean {
  const candidateAt = Date.parse(candidate.startedAt ?? "");
  const currentAt = Date.parse(current.startedAt ?? "");
  if (Number.isNaN(candidateAt)) return Number.isNaN(currentAt);
  if (Number.isNaN(currentAt)) return true;
  return candidateAt >= currentAt;
}

/**
 * One entry per check, the most recent run of each.
 *
 * A re-run does not replace its predecessor in the rollup — GitHub returns
 * both — so a check that failed and was re-run green appears twice, and
 * counting the raw rollup reports a failure that no longer exists. #5850 read
 * "1 fail · 6 pass" while every check on it was green, because "Validate PR
 * title" failed at 12:38:14 and succeeded on re-run twenty seconds later.
 *
 * Keyed on the check's name, or on `context` for the StatusContext entries
 * that have no name. An entry with neither cannot be matched against anything,
 * so it is kept rather than dropped or collapsed with other nameless entries.
 */
export function latestChecks(rollup: RawPullRequest["statusCheckRollup"]): RollupEntry[] {
  const latest = new Map<string, RollupEntry>();
  let anonymous = 0;

  for (const entry of rollup ?? []) {
    const key = (entry.name ?? entry.context ?? "").trim();
    if (key === "") {
      latest.set(`\u0000${anonymous++}`, entry);
      continue;
    }
    const current = latest.get(key);
    if (!current || isSameOrLater(entry, current)) latest.set(key, entry);
  }

  return [...latest.values()];
}

type CheckOutcome = "pass" | "fail" | "skip" | "pending" | "cancelled";

function outcomeOf(entry: RollupEntry): CheckOutcome {
  // StatusContext: no status/conclusion, only state.
  if (entry.state !== undefined && entry.status === undefined) {
    const state = entry.state.toUpperCase();
    if (state === "SUCCESS") return "pass";
    if (state === "PENDING" || state === "EXPECTED") return "pending";
    return "fail";
  }

  // CheckRun: a run that has not completed has no meaningful conclusion.
  if ((entry.status ?? "").toUpperCase() !== "COMPLETED") return "pending";

  const conclusion = (entry.conclusion ?? "").toUpperCase();
  if (conclusion === "SUCCESS") return "pass";
  if (SKIPPED_CONCLUSIONS.has(conclusion)) return "skip";
  if (conclusion === "CANCELLED") return "cancelled";
  if (FAILED_CONCLUSIONS.has(conclusion)) return "fail";
  return "pending";
}

export function summarizeChecks(
  rollup: RawPullRequest["statusCheckRollup"],
): ChecksSummary {
  const summary: ChecksSummary = {
    pass: 0,
    fail: 0,
    skip: 0,
    pending: 0,
    cancelled: 0,
    total: 0,
  };

  for (const entry of latestChecks(rollup)) {
    summary.total += 1;
    summary[outcomeOf(entry)] += 1;
  }

  return summary;
}

/** The names of the checks failing on the latest run, sorted, nameless ones left out. */
export function failingCheckNames(rollup: RawPullRequest["statusCheckRollup"]): string[] {
  return latestChecks(rollup)
    .filter((entry) => outcomeOf(entry) === "fail")
    .map((entry) => (entry.name ?? entry.context ?? "").trim())
    .filter((name) => name !== "")
    .sort();
}

const LIVE_FEEDBACK_STATES = new Set(["CHANGES_REQUESTED", "COMMENTED"]);

/** Requested reviewers, as user logins or team slugs. Never reads .login alone. */
function requestedReviewers(pr: RawPullRequest): string[] {
  return pr.reviewRequests.map((entry) => entry.login ?? entry.slug ?? entry.name ?? "unknown");
}

function approvers(pr: RawPullRequest): string[] {
  return pr.latestReviews
    .filter((entry) => entry.state === "APPROVED")
    .map((entry) => entry.author?.login)
    .filter((login): login is string => Boolean(login));
}

/** Reviewers whose latest review requested changes. */
function changesRequesters(pr: RawPullRequest): string[] {
  return pr.latestReviews
    .filter((entry) => entry.state === "CHANGES_REQUESTED")
    .map((entry) => entry.author?.login)
    .filter((login): login is string => Boolean(login));
}

/** Everyone who ever commented, minus the author's own replies, deduplicated. */
function commenters(pr: RawPullRequest): string[] {
  const authorLogin = pr.author?.login ?? null;
  const seen = new Set<string>();
  for (const entry of pr.reviews) {
    const login = entry.author?.login;
    if (!login || login === authorLogin) continue;
    if (entry.state === "APPROVED" || LIVE_FEEDBACK_STATES.has(entry.state)) seen.add(login);
  }
  return [...seen];
}

/**
 * Reviewers whose latest review says something in prose.
 *
 * The case this exists for: an APPROVED review whose body is three paragraphs
 * of "one thing before you merge". GitHub files that as an approval, it leaves
 * no unresolved thread, and it is not an issue comment — so every other signal
 * on the row reports a clean approval, and the panel offers a Merge button
 * over the top of it.
 *
 * Read from latestReviews rather than reviews: an earlier round's notes were
 * answered by the round that superseded them, and re-raising them would make
 * the flag permanent.
 */
export function reviewNotes(pr: RawPullRequest): string[] {
  const authorLogin = pr.author?.login ?? null;
  // The full history, not `latestReviews`. That field keeps only the most
  // recent review per reviewer, and on #5886 a reviewer approved with 189
  // characters naming a blocker and then left a second, empty COMMENTED
  // review — which hid the fact that anything had been written at all.
  //
  // But an earlier round that was *answered* must not resurface either, or the
  // note becomes permanent. What separates the two is the state of the empty
  // review that follows: an empty approval is a sign-off and supersedes
  // whatever the reviewer said before it. An empty comment says nothing and
  // resolves nothing, so it supersedes nothing.
  //
  // And a note the author has replied to since, in a comment or a review
  // thread, has been read and answered, so it no longer counts.
  const noted = new Map<string, string | null | undefined>();
  for (const entry of pr.reviews) {
    const login = entry.author?.login;
    if (!login || login === authorLogin) continue;

    if ((entry.body ?? "").trim() === "") {
      if (entry.state.toUpperCase() === "APPROVED") noted.delete(login);
      continue;
    }
    noted.set(login, entry.submittedAt);
  }
  return [...noted].filter(([, at]) => !answeredSince(pr, at)).map(([login]) => login);
}

/**
 * The newest comment's author, when it is not the pull request's own author.
 *
 * GitHub's review states say nothing about general comments, so an approved
 * pull request can sit with an unanswered question and still look ready. If
 * the author spoke last, the ball is with the reviewer and there is nothing to
 * report.
 */
/**
 * Accounts whose comments are not a question waiting on anyone.
 *
 * `gh pr list --json comments` exposes only `login` on the author, with no bot
 * flag, so this matches on the name: the `[bot]` suffix GitHub Apps carry, plus
 * the bare logins the common CI integrations post under. Left as a list rather
 * than a setting because a wrong entry here only costs one row's hint.
 */
const BOT_LOGINS = new Set([
  "github-actions",
  "dependabot",
  "codecov",
  "renovate",
  "vercel",
  "netlify",
  "sonarcloud",
]);

export function isBotLogin(login: string): boolean {
  return login.endsWith("[bot]") || BOT_LOGINS.has(login.toLowerCase());
}

export function lastCommentBy(pr: RawPullRequest): string | null {
  const authorLogin = pr.author?.login ?? null;
  let newest: { at: number; login: string } | null = null;

  for (const comment of pr.comments ?? []) {
    const login = comment.author?.login;
    if (!login || isBotLogin(login)) continue;
    const at = Date.parse(comment.createdAt ?? "");
    if (Number.isNaN(at)) continue;
    if (newest === null || at > newest.at) newest = { at, login };
  }

  if (newest === null || newest.login === authorLogin) return null;
  return newest.login;
}

/**
 * When the author last said anything on the pull request: a comment, or a
 * review of their own, which is what a reply in a review thread is filed as.
 */
function authorLastActive(pr: RawPullRequest): number {
  const authorLogin = pr.author?.login ?? null;
  let last = -Infinity;
  if (!authorLogin) return last;
  for (const comment of pr.comments ?? []) {
    if (comment.author?.login !== authorLogin) continue;
    const at = Date.parse(comment.createdAt ?? "");
    if (!Number.isNaN(at)) last = Math.max(last, at);
  }
  for (const entry of pr.reviews) {
    if (entry.author?.login !== authorLogin) continue;
    const at = Date.parse(entry.submittedAt ?? "");
    if (!Number.isNaN(at)) last = Math.max(last, at);
  }
  return last;
}

/**
 * Whether the author has spoken since a review was left. A review with no
 * date is never answered, so an old listing without dates flags as before.
 */
function answeredSince(pr: RawPullRequest, submittedAt: string | null | undefined): boolean {
  const at = Date.parse(submittedAt ?? "");
  return !Number.isNaN(at) && authorLastActive(pr) > at;
}

/**
 * A reviewer's latest review asks something of the author. Requested changes
 * always do, until the reviewer reviews again. A comment review stops asking
 * once the author has replied after it: its inline threads are then answered
 * or counted as unanswered on their own, and its body was read to reply.
 */
function hasLiveFeedback(pr: RawPullRequest): boolean {
  return pr.latestReviews.some(
    (entry) =>
      entry.state === "CHANGES_REQUESTED" ||
      (LIVE_FEEDBACK_STATES.has(entry.state) && !answeredSince(pr, entry.submittedAt)),
  );
}

function isAwaitingReReview(pr: RawPullRequest): boolean {
  return (
    pr.reviewDecision === "CHANGES_REQUESTED" &&
    !hasLiveFeedback(pr) &&
    pr.reviewRequests.length > 0
  );
}

/**
 * True when some open pull request in this repository has checks.
 *
 * An empty rollup usually means CI failed to run and is worth flagging. It
 * means nothing, though, in a repository where CI does not run on pull
 * requests at all — psi-deploy has workflows, but none of them trigger here,
 * so every pull request reads "no CI" forever with nothing to fix.
 */
export function repoRunsChecks(prs: readonly RawPullRequest[]): boolean {
  return prs.some((pr) => (pr.statusCheckRollup ?? []).length > 0);
}

/** Per-repository rules that are a preference rather than a fact about the PR. */
export interface ClassifyOptions {
  /**
   * True where nobody is ever assigned as a reviewer, so an unassigned pull
   * request is the normal state rather than something to chase.
   *
   * Applied here rather than by hiding the badge in the panel, because the
   * flag is what puts a row in Needs action and what names the work a spawned
   * thread would do. Suppressed downstream, the row would keep claiming to
   * need attention it does not need.
   */
  reviewerOptional?: boolean;
}

export function classifyOne(
  pr: RawPullRequest,
  repo: string,
  repoHasChecks = true,
  options: ClassifyOptions = {},
): ClassifiedRow {
  const checks = summarizeChecks(pr.statusCheckRollup);
  const approvedBy = approvers(pr);
  const flags = new Set<Flag>();

  if (pr.mergeable === "CONFLICTING") flags.add("conflict");
  else if (pr.mergeable === "UNKNOWN") flags.add("mergeable-unknown");

  if (checks.fail > 0) flags.add("ci-failing");
  if (checks.cancelled > 0) flags.add("ci-cancelled");
  if (checks.pending > 0) flags.add("ci-pending");
  // Only a fault where CI otherwise runs; see repoRunsChecks.
  if (checks.total === 0 && repoHasChecks) flags.add("ci-absent");

  if (hasLiveFeedback(pr)) flags.add("feedback");

  const covered = pr.reviewRequests.length > 0 || pr.latestReviews.length > 0;
  if (!pr.isDraft && !covered && !options.reviewerOptional) flags.add("no-reviewer");

  const awaitingReReview = isAwaitingReReview(pr);

  // Merge readiness: everything the author controls is done. An empty rollup
  // is not green, and BLOCKED with an approval means a required review is
  // still missing, so GitHub would refuse the merge.
  //
  // A re-requested review is not merge readiness. The author answered the
  // changes and put the ball back in the reviewers' court, so an older
  // approval sitting alongside makes the row look finished when what it is
  // doing is waiting. Flagging it read "merge blocked · Unblock merge" on a
  // pull request with nothing to unblock.
  const green =
    checks.total > 0 && checks.fail === 0 && checks.pending === 0 && checks.cancelled === 0;
  const ready =
    approvedBy.length > 0 &&
    green &&
    pr.mergeable === "MERGEABLE" &&
    !pr.isDraft &&
    !hasLiveFeedback(pr) &&
    !awaitingReReview;

  if (ready) {
    if (pr.mergeStateStatus === "BLOCKED") flags.add("merge-blocked");
    else flags.add("merge-ready");
  }

  const ordered = FLAG_SEVERITY.filter((flag) => flags.has(flag));

  return {
    repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    isDraft: pr.isDraft,
    flags: ordered,
    group: groupForFlags(ordered),
    checks,
    approvedBy,
    commentedBy: commenters(pr),
    notedBy: reviewNotes(pr),
    waitingOn: requestedReviewers(pr),
    lastCommentBy: lastCommentBy(pr),
    unresolvedThreads: 0,
    outdatedThreads: 0,
    repliedThreads: 0,
    unansweredBy: [],
    // Filled in by the sweep, which reads the rest of each stack in one more call.
    stack: null,
    awaitingReReview,
    // Zero for a missing or unreadable date, which the listing reads as unknown.
    updatedAt: Date.parse(pr.updatedAt ?? "") || 0,
    commentsCount: pr.comments?.length ?? 0,
    changesRequestedBy: changesRequesters(pr),
    additions: pr.additions,
    deletions: pr.deletions,
    baseRefName: pr.baseRefName,
    headSha: pr.headRefOid,
    failingChecks: failingCheckNames(pr.statusCheckRollup),
  };
}

export function classify(
  prs: RawPullRequest[],
  repo: string,
  options: ClassifyOptions = {},
): ClassifiedRow[] {
  const repoHasChecks = repoRunsChecks(prs);
  return prs
    .map((pr) => classifyOne(pr, repo, repoHasChecks, options))
    .sort((a, b) => {
      const rank = (row: ClassifiedRow) =>
        row.flags.length === 0 ? FLAG_SEVERITY.length : FLAG_SEVERITY.indexOf(row.flags[0]!);
      return rank(a) - rank(b) || a.number - b.number;
    });
}
