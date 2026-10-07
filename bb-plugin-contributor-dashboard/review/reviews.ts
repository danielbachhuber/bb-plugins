// Which reviews on a pull request count, and how they collapse into rounds.
// Shared by the per-person counts and the person page, so both say the same.
import { isBot, type PullRequestReview, type PullRequestWithActivity } from "../mirror/github.js";

/** Reviews that count: submitted, by a person other than the author, oldest first. */
export function countedReviews(pr: PullRequestWithActivity): PullRequestReview[] {
  const author = pr.author?.login;
  return pr.reviews
    .filter(
      (review) =>
        review.state !== "PENDING" &&
        review.submittedAt !== null &&
        review.author !== null &&
        !isBot(review.author) &&
        review.author.login !== author,
    )
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
}

/** The local calendar day, so a burst of replies in one sitting counts once. */
export function localDay(iso: string): string {
  const at = new Date(iso);
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

/**
 * One entry per reviewer per day, oldest first: a reviewer who replies to six
 * comments in an afternoon has reviewed once, not six times.
 */
export function reviewRounds(reviews: readonly PullRequestReview[]): PullRequestReview[] {
  const seen = new Set<string>();
  const rounds: PullRequestReview[] = [];
  for (const review of reviews) {
    const key = `${review.author!.login}|${localDay(review.submittedAt!)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rounds.push(review);
  }
  return rounds;
}
