// Everyone the mirror has seen on a pull request, for the person finder.
// Pure: reads stored GitHub objects, makes no calls.
import { isBot, type PullRequestWithActivity } from "../mirror/github.js";

/**
 * Each login that opened a pull request, reviewed one, or was asked to review
 * one, most recently active first, bots left out. A person's page has
 * something to show for each of them, whatever the period.
 */
export function everyone(prs: readonly PullRequestWithActivity[]): string[] {
  const last = new Map<string, string>();
  const seen = (actor: { __typename?: string; login?: string } | null | undefined, at: string) => {
    if (actor === null || actor === undefined || actor.login === undefined || actor.login === "" || isBot(actor)) return;
    const previous = last.get(actor.login);
    if (previous === undefined || at > previous) last.set(actor.login, at);
  };

  for (const pr of prs) {
    seen(pr.author, pr.createdAt);
    for (const review of pr.reviews) seen(review.author, review.submittedAt ?? review.createdAt);
    for (const item of pr.timelineItems) {
      if (item.__typename !== "ReviewRequestedEvent" || item.requestedReviewer === null) continue;
      if ("login" in item.requestedReviewer) seen(item.requestedReviewer, item.createdAt);
    }
  }

  return [...last.entries()]
    .sort(([a, atA], [b, atB]) => (atA === atB ? a.localeCompare(b) : atA < atB ? 1 : -1))
    .map(([login]) => login);
}
