// Reviews requested from and given by each person, per bucket of a period.
// Pure: reads stored GitHub objects, makes no calls.
import { isBot, type PullRequestReview, type PullRequestWithActivity, type TimelineItem } from "../mirror/github.js";
import { bucketIndex, type Bucket } from "../dashboard/period.js";

export interface PersonActivity {
  login: string;
  /** Review requests per bucket: made of them directly, or made of a team they then reviewed for. */
  requested: number[];
  /** Reviews submitted per bucket, counting a person's reviews on one pull request on one day once. */
  given: number[];
  requestedTotal: number;
  givenTotal: number;
}

type RequestEvent = Extract<TimelineItem, { __typename: "ReviewRequestedEvent" | "ReviewRequestRemovedEvent" }>;

const isRequestEvent = (item: TimelineItem): item is RequestEvent =>
  item.__typename === "ReviewRequestedEvent" || item.__typename === "ReviewRequestRemovedEvent";

/** Reviews that count: submitted, by a person other than the author. */
function countedReviews(pr: PullRequestWithActivity): PullRequestReview[] {
  const author = pr.author?.login;
  return pr.reviews.filter(
    (review) =>
      review.state !== "PENDING" &&
      review.submittedAt !== null &&
      review.author !== null &&
      !isBot(review.author) &&
      review.author.login !== author,
  );
}

/** The local calendar day, so a burst of replies in one sitting counts once. */
function localDay(iso: string): string {
  const at = new Date(iso);
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

/**
 * Who picked up a request made of a team: the first person to review after it
 * who had not also been asked directly in the meantime. Nobody, when the team
 * request was withdrawn first or no one reviewed.
 */
function teamRequestWinner(
  request: RequestEvent,
  events: readonly RequestEvent[],
  reviews: readonly PullRequestReview[],
): string | null {
  const slug = request.requestedReviewer !== null && "slug" in request.requestedReviewer ? request.requestedReviewer.slug : null;
  const withdrawn = events.find(
    (event) =>
      event.__typename === "ReviewRequestRemovedEvent" &&
      event.createdAt > request.createdAt &&
      event.requestedReviewer !== null &&
      "slug" in event.requestedReviewer &&
      event.requestedReviewer.slug === slug,
  );
  for (const review of reviews) {
    const at = review.submittedAt ?? review.createdAt;
    if (at <= request.createdAt) continue;
    if (withdrawn !== undefined && at > withdrawn.createdAt) return null;
    const login = review.author?.login;
    const askedDirectly = events.some(
      (event) =>
        event.__typename === "ReviewRequestedEvent" &&
        event.createdAt > request.createdAt &&
        event.createdAt < at &&
        event.requestedReviewer !== null &&
        "login" in event.requestedReviewer &&
        event.requestedReviewer.login === login,
    );
    if (!askedDirectly && login !== undefined) return login;
  }
  return null;
}

export function peopleActivity(prs: readonly PullRequestWithActivity[], buckets: readonly Bucket[]): PersonActivity[] {
  const people = new Map<string, PersonActivity>();
  const person = (login: string) => {
    let entry = people.get(login);
    if (entry === undefined) {
      entry = {
        login,
        requested: buckets.map(() => 0),
        given: buckets.map(() => 0),
        requestedTotal: 0,
        givenTotal: 0,
      };
      people.set(login, entry);
    }
    return entry;
  };
  const add = (login: string, field: "requested" | "given", at: string) => {
    const index = bucketIndex(buckets, Date.parse(at));
    if (index < 0) return;
    const entry = person(login);
    entry[field][index] += 1;
    if (field === "requested") entry.requestedTotal += 1;
    else entry.givenTotal += 1;
  };

  for (const pr of prs) {
    const reviews = countedReviews(pr).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
    const events = pr.timelineItems.filter(isRequestEvent);

    for (const event of events) {
      if (event.__typename !== "ReviewRequestedEvent" || event.requestedReviewer === null) continue;
      const reviewer = event.requestedReviewer;
      if ("slug" in reviewer) {
        const winner = teamRequestWinner(event, events, reviews);
        if (winner !== null) add(winner, "requested", event.createdAt);
      } else if (!isBot(reviewer)) {
        add(reviewer.login, "requested", event.createdAt);
      }
    }

    const seen = new Set<string>();
    for (const review of reviews) {
      const login = review.author!.login;
      const key = `${login}|${localDay(review.submittedAt!)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add(login, "given", review.submittedAt!);
    }
  }

  return [...people.values()].sort((a, b) => a.login.localeCompare(b.login, "en", { sensitivity: "base" }));
}
