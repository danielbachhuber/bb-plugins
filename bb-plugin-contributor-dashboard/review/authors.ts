// Pull requests opened by each person, and how many of them merged, per bucket
// of a period. Pure: reads stored GitHub objects, makes no calls.
import { isBot, type PullRequestWithActivity } from "../mirror/github.js";
import { bucketIndex, type Bucket } from "../dashboard/period.js";

export interface AuthorActivity {
  login: string;
  /** Pull requests they opened, in the bucket they were opened in. */
  opened: number[];
  /** Pull requests of theirs that merged, in the bucket they merged in. */
  merged: number[];
  openedTotal: number;
  mergedTotal: number;
}

/**
 * A pull request counts for whoever opened it. A merge counts in the bucket it
 * merged in, which may be a later bucket than the one it was opened in, so the
 * two lines are not a fraction of one another.
 */
export function authorActivity(
  prs: readonly PullRequestWithActivity[],
  buckets: readonly Bucket[],
): AuthorActivity[] {
  const people = new Map<string, AuthorActivity>();
  const person = (login: string) => {
    let entry = people.get(login);
    if (entry === undefined) {
      entry = {
        login,
        opened: buckets.map(() => 0),
        merged: buckets.map(() => 0),
        openedTotal: 0,
        mergedTotal: 0,
      };
      people.set(login, entry);
    }
    return entry;
  };

  for (const pr of prs) {
    const author = pr.author;
    if (author === null || author === undefined || isBot(author)) continue;

    const openedIn = bucketIndex(buckets, Date.parse(pr.createdAt));
    if (openedIn >= 0) {
      const entry = person(author.login);
      entry.opened[openedIn] += 1;
      entry.openedTotal += 1;
    }

    if (pr.mergedAt !== null) {
      const mergedIn = bucketIndex(buckets, Date.parse(pr.mergedAt));
      if (mergedIn >= 0) {
        const entry = person(author.login);
        entry.merged[mergedIn] += 1;
        entry.mergedTotal += 1;
      }
    }
  }

  return [...people.values()];
}
