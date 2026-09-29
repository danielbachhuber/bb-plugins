import { githubAvatar, type Reviewer } from "sweep-ui/pull-request";
import { runOf, type ListedReview, type TierInputs } from "./tiers.js";
import { ageInDays } from "./types.js";

/**
 * What a review's row says about it beyond its title: the banner under the
 * title and the other reviewers' avatars. Pure, and read only from what the
 * sweep already fetched.
 */

export type Banner = { tone: "blocked" | "info"; text: string };

/**
 * "Waiting on you for 5 days" in red for a request in the overdue run, the
 * same rows the flag tints, or "Asked to review again" in blue for a
 * re-review. Nothing otherwise: a fresh request asks nothing beyond its place
 * in the list.
 */
export function bannerFor(row: ListedReview, inputs: TierInputs): Banner | null {
  if (runOf(row, inputs) === "overdue") {
    const days = ageInDays(row.requestedAt, inputs.now);
    return { tone: "blocked", text: `Waiting on you for ${days} ${days === 1 ? "day" : "days"}` };
  }
  if (row.state === "re-review") return { tone: "info", text: "Asked to review again" };
  return null;
}

/** The other reviewers with their pictures. A team shows its organization's. */
export function reviewersFor(
  row: Pick<ListedReview, "reviewers">,
  avatarFor: (owner: string) => string = githubAvatar,
): Reviewer[] {
  return row.reviewers.map((reviewer) => ({
    ...reviewer,
    avatarUrl: avatarFor(reviewer.team ? reviewer.login.split("/")[0]! : reviewer.login),
  }));
}
