// What each release published: how many pull requests its notes list, what
// kind they are, who wrote and reviewed them, and which patches followed it.
//
// A release says what it holds only in its notes, so the pull requests are
// read from the links there. Notes with a "## Merged Pull Requests" heading
// list them under it, and the links above it repeat some of the same ones in
// prose; notes without the heading, which patches often are, are read whole.
import { isBot, type PullRequestWithActivity, type Release } from "../mirror/github.js";

import { countedReviews } from "./reviews.js";

export const KINDS = ["feat", "fix", "refactor", "chore", "deps", "none"] as const;
export type Kind = (typeof KINDS)[number];
export type KindCounts = Record<Kind, number>;

/** Conventional-commit types, grouped into the kinds the page draws. */
const KIND_OF_TYPE: Record<string, Kind> = {
  feat: "feat",
  fix: "fix",
  bugfix: "fix",
  hotfix: "fix",
  revert: "fix",
  refactor: "refactor",
  perf: "refactor",
  chore: "chore",
  docs: "chore",
  test: "chore",
  ci: "chore",
  build: "chore",
  style: "chore",
  lint: "chore",
};

/**
 * A pull request's kind, from the type prefix on its title, such as
 * "fix(api): ...". Anything a bot opened is a dependency update whatever its
 * title says, since that is nearly all bots open.
 */
export function kindOf(pr: { title: string; author: { __typename?: string; login?: string } | null }): Kind {
  if (isBot(pr.author)) return "deps";
  const type = /^(\w+)(?:\([^)]*\))?!?:/.exec(pr.title.trim())?.[1]?.toLowerCase();
  return (type === undefined ? undefined : KIND_OF_TYPE[type]) ?? "none";
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The pull request numbers a release's notes list, in the order they appear. */
export function listedPullRequests(description: string | null, repository: string): number[] {
  if (description === null) return [];
  const heading = /^##\s+Merged Pull Requests\s*$/im.exec(description);
  const listing = heading === null ? description : description.slice(heading.index);
  const link = new RegExp(`github\\.com/${escape(repository)}/pull/(\\d+)`, "gi");
  return [...new Set([...listing.matchAll(link)].map((match) => Number(match[1])))];
}

/**
 * The first bulleted line of a release's notes, under its pull request list
 * when it has one, as plain text. A patch that reverts says so here, where
 * the titles of the pull requests it links would say the opposite.
 */
export function firstLineOf(description: string | null): string | null {
  if (description === null) return null;
  const heading = /^##\s+Merged Pull Requests\s*$/im.exec(description);
  const listing = heading === null ? description : description.slice(heading.index);
  const bullet = /^\s*[*-]\s+(.+)$/m.exec(listing)?.[1];
  if (bullet === undefined) return null;
  return bullet
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\s*\(\s*#\d+(?:\s*,\s*#\d+)*\s*\)\s*$/, "")
    .trim();
}

/** A tag's version, or null when it is not one. */
function versionOf(tag: string): { series: string; patch: number } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag);
  return match === null ? null : { series: `${match[1]}.${match[2]}`, patch: Number(match[3]) };
}

export interface ReleasePerson {
  login: string;
  /** Pull requests they opened that the release lists. */
  merged: number;
  /** Listed pull requests they reviewed, once each however many times they reviewed. */
  reviews: number;
}

export interface ReleaseSummary {
  tag: string;
  url: string;
  publishedAt: string;
  /** Pull requests the notes list that the mirror holds. */
  total: number;
  kinds: KindCounts;
  /** Busiest first. Bots are left out and counted in `bot`. */
  people: ReleasePerson[];
  /** Listed pull requests a bot opened. */
  bot: number;
  /** Listed numbers the mirror does not hold, such as ones older than its two years. */
  missing: number;
}

export interface PatchSummary extends ReleaseSummary {
  /** The first item in its notes, to say what the patch did. */
  firstLine: string | null;
}

export interface MinorSummary extends ReleaseSummary {
  /** The patches published on this minor, oldest first. */
  patches: PatchSummary[];
}

export interface ReleasesResult {
  /** Releases published in the period, minors and patches together. */
  published: number;
  /** Minors published in the period, newest first, each with its patches. */
  minors: MinorSummary[];
  /** Patches published in the period. */
  patches: number;
}

function summarise(
  release: Release,
  byNumber: ReadonlyMap<number, PullRequestWithActivity>,
  repository: string,
): ReleaseSummary & { listed: PullRequestWithActivity[] } {
  const kinds: KindCounts = { feat: 0, fix: 0, refactor: 0, chore: 0, deps: 0, none: 0 };
  const people = new Map<string, ReleasePerson>();
  const person = (login: string) => {
    const found = people.get(login) ?? { login, merged: 0, reviews: 0 };
    people.set(login, found);
    return found;
  };
  const listed: PullRequestWithActivity[] = [];
  let missing = 0;
  let bot = 0;
  for (const number of listedPullRequests(release.description, repository)) {
    const pr = byNumber.get(number);
    if (pr === undefined) {
      missing += 1;
      continue;
    }
    listed.push(pr);
    kinds[kindOf(pr)] += 1;
    if (isBot(pr.author)) bot += 1;
    else if (pr.author !== null) person(pr.author.login).merged += 1;
    for (const login of new Set(countedReviews(pr).map((review) => review.author!.login))) person(login).reviews += 1;
  }
  return {
    tag: release.tagName,
    url: release.url,
    publishedAt: release.publishedAt!,
    total: listed.length,
    kinds,
    people: [...people.values()].sort((a, b) => b.merged - a.merged || b.reviews - a.reviews || a.login.localeCompare(b.login)),
    bot,
    missing,
    listed,
  };
}

/**
 * The releases published in the period. A patch is grouped under the minor
 * of its series, so a patch published after the period's minor still shows
 * with it; a series counts as in the period when its minor is. A tag that is
 * not a version stands as a minor of its own.
 */
export function releaseSummaries(
  releases: readonly Release[],
  pullRequests: readonly PullRequestWithActivity[],
  repository: string,
  from: number,
  to: number,
): ReleasesResult {
  const byNumber = new Map(pullRequests.map((pr) => [pr.number, pr]));
  const published = releases.filter((release) => !release.isDraft && release.publishedAt !== null);
  const inPeriod = (release: Release) => {
    const at = Date.parse(release.publishedAt!);
    return at >= from && at < to;
  };
  const minors: MinorSummary[] = [];
  for (const release of published) {
    const version = versionOf(release.tagName);
    if (version !== null && version.patch > 0) continue;
    if (!inPeriod(release)) continue;
    const { listed: _listed, ...summary } = summarise(release, byNumber, repository);
    const patches = version === null ? [] : published.filter((other) => {
      const v = versionOf(other.tagName);
      return v !== null && v.series === version.series && v.patch > 0;
    });
    minors.push({
      ...summary,
      patches: patches
        .map((patch) => {
          const { listed: _listed, ...rest } = summarise(patch, byNumber, repository);
          return { ...rest, firstLine: firstLineOf(patch.description) };
        })
        .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
    });
  }
  minors.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return {
    published: published.filter(inPeriod).length,
    minors,
    patches: published.filter((release) => inPeriod(release) && (versionOf(release.tagName)?.patch ?? 0) > 0).length,
  };
}
