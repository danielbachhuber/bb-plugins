// Review requests made of a team: who picked each one up, what is still
// waiting on a team nobody has started, and how each team shares the work.
// Pure: reads stored GitHub objects and the stored team members, makes no calls.
import { isBot, type PullRequestWithActivity } from "../mirror/github.js";
import { bucketIndex, type Bucket } from "../dashboard/period.js";

import { businessDaysBetween } from "./business-time.js";
import { isRequestEvent, teamRequestWinner, type RequestEvent } from "./people.js";
import { readyAt } from "./person.js";
import { countedReviews } from "./reviews.js";
import { percentilesOf } from "./stages.js";

/** Each team's members by slug, as the sync stored them. */
export type TeamMembers = ReadonlyMap<string, readonly string[]>;

const slugOf = (event: RequestEvent): string | null =>
  event.requestedReviewer !== null && "slug" in event.requestedReviewer ? event.requestedReviewer.slug : null;

const loginOf = (event: RequestEvent): string | null =>
  event.requestedReviewer !== null && "login" in event.requestedReviewer && !isBot(event.requestedReviewer)
    ? event.requestedReviewer.login
    : null;

/**
 * The reviewers a pull request is waiting on now: each team and person whose
 * latest request was not withdrawn, with when it was made. GitHub clears a
 * request once it is answered without recording it, so a request is also
 * over once anyone has reviewed since it, for a team, or that person has,
 * for a person.
 */
export function openRequests(pr: PullRequestWithActivity): {
  teams: Map<string, string>;
  people: Map<string, string>;
} {
  const teams = new Map<string, string>();
  const people = new Map<string, string>();
  for (const event of pr.timelineItems.filter(isRequestEvent)) {
    const slug = slugOf(event);
    const login = loginOf(event);
    const into = slug !== null ? teams : people;
    const key = slug ?? login;
    if (key === null) continue;
    if (event.__typename === "ReviewRequestedEvent") into.set(key, event.createdAt);
    else into.delete(key);
  }
  const reviews = countedReviews(pr);
  for (const [slug, at] of teams) {
    if (reviews.some((review) => review.submittedAt! > at)) teams.delete(slug);
  }
  for (const [login, at] of people) {
    if (reviews.some((review) => review.author?.login === login && review.submittedAt! > at)) people.delete(login);
  }
  return { teams, people };
}

/** An open pull request waiting on a team the person is in, which nobody has reviewed since. */
export interface TeamAwaitingRow {
  number: number;
  title: string;
  url: string;
  author: string | null;
  assignees: string[];
  /** The person's teams it is waiting on. */
  teams: string[];
  /** People asked by name who have not reviewed yet. */
  named: string[];
  requestedAt: string;
  waitingDays: number;
}

/**
 * Open pull requests waiting on a team `login` is in, with no review from
 * anyone since the team was asked, longest wait first. Leaves out their own
 * pull requests, and any that ask for them by name, which the list of
 * requests that name them already holds.
 */
export function awaitingTeamReview(
  prs: readonly PullRequestWithActivity[],
  login: string,
  members: TeamMembers,
  now: number,
): TeamAwaitingRow[] {
  const theirs = new Set([...members].filter(([, logins]) => logins.includes(login)).map(([slug]) => slug));
  if (theirs.size === 0) return [];
  const rows: TeamAwaitingRow[] = [];
  for (const pr of prs) {
    if (pr.state !== "OPEN" || pr.isDraft || pr.author?.login === login) continue;
    const { teams, people } = openRequests(pr);
    if (people.has(login)) continue;
    const waitingOn = [...teams].filter(([slug]) => theirs.has(slug));
    if (waitingOn.length === 0) continue;
    const requestedAt = waitingOn.map(([, at]) => at).sort()[0];
    // A request made while it was still a draft only starts the clock once it is ready.
    const ready = readyAt(pr);
    const from = ready !== null && ready > requestedAt ? ready : requestedAt;
    rows.push({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author?.login ?? null,
      assignees: (pr.assignees ?? []).map((who) => who.login).filter((who): who is string => who !== undefined),
      teams: waitingOn.map(([slug]) => slug).sort(),
      named: [...people.keys()].sort(),
      requestedAt,
      waitingDays: businessDaysBetween(Date.parse(from), now),
    });
  }
  return rows.sort((a, b) => b.waitingDays - a.waitingDays);
}

/** One team's review requests over a period, and who picked them up. */
export interface TeamActivity {
  slug: string;
  /** Requests made of the team in the period. */
  requested: number;
  /** Of those, the ones someone on it picked up. */
  pickedUp: number;
  /** Business days from the request to the review that picked it up. */
  median: number;
  p90: number;
  /** Open pull requests waiting on the team now, nobody started. */
  waiting: number;
  /** Who picked up how many, most first, then members who picked up none. */
  pickups: Array<{ login: string; count: number }>;
}

/**
 * Every team asked for a review in the period, most asked first. A member
 * who picked up none is listed at the end of their team's pickups, when the
 * sync has read the team's members.
 */
export function teamActivity(
  prs: readonly PullRequestWithActivity[],
  buckets: readonly Bucket[],
  members: TeamMembers,
): TeamActivity[] {
  const teams = new Map<string, { requested: number; waits: number[]; pickups: Map<string, number>; waiting: number }>();
  const team = (slug: string) => {
    let entry = teams.get(slug);
    if (entry === undefined) {
      entry = { requested: 0, waits: [], pickups: new Map(), waiting: 0 };
      teams.set(slug, entry);
    }
    return entry;
  };

  for (const pr of prs) {
    const reviews = countedReviews(pr);
    const events = pr.timelineItems.filter(isRequestEvent);
    for (const event of events) {
      const slug = slugOf(event);
      if (event.__typename !== "ReviewRequestedEvent" || slug === null) continue;
      if (bucketIndex(buckets, Date.parse(event.createdAt)) < 0) continue;
      const entry = team(slug);
      entry.requested += 1;
      const winner = teamRequestWinner(event, events, reviews);
      if (winner === null) continue;
      entry.pickups.set(winner, (entry.pickups.get(winner) ?? 0) + 1);
      const review = reviews.find((r) => r.author?.login === winner && r.submittedAt! > event.createdAt)!;
      entry.waits.push(businessDaysBetween(Date.parse(event.createdAt), Date.parse(review.submittedAt!)));
    }
  }

  // What waits now is whatever the period, so a team asked before it still shows.
  for (const pr of prs) {
    if (pr.state !== "OPEN" || pr.isDraft) continue;
    for (const slug of openRequests(pr).teams.keys()) {
      team(slug).waiting += 1;
    }
  }

  return [...teams]
    .map(([slug, entry]) => {
      const counted = [...entry.pickups]
        .map(([login, count]) => ({ login, count }))
        .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
      const none = (members.get(slug) ?? [])
        .filter((login) => !entry.pickups.has(login))
        .sort((a, b) => a.localeCompare(b))
        .map((login) => ({ login, count: 0 }));
      const { median, p90 } = percentilesOf(entry.waits);
      return {
        slug,
        requested: entry.requested,
        pickedUp: entry.waits.length,
        median,
        p90,
        waiting: entry.waiting,
        pickups: [...counted, ...none],
      };
    })
    .sort((a, b) => b.requested - a.requested || a.slug.localeCompare(b.slug));
}
