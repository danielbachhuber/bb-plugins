// Mirrors one repository's pull requests into the store.
//
// GitHub returns pull requests most recently updated first, and any review or
// review request bumps a pull request's updatedAt. So each sync pages down from
// the top until it reaches what the last sync already saw (the high-water
// mark). The first sync instead backfills down to BACKFILL_MS ago, saving its
// cursor after every page so an interrupted backfill resumes where it stopped.
import {
  ISSUES_QUERY,
  MORE_ISSUE_TIMELINE_QUERY,
  MORE_REVIEWS_QUERY,
  MORE_TIMELINE_QUERY,
  PULL_REQUESTS_QUERY,
  RELEASES_QUERY,
  type Connection,
  type IssueNode,
  type IssueTimelineItem,
  type PullRequestNode,
  type PullRequestReview,
  type Release,
  type TimelineItem,
} from "./github.js";
import { BACKFILL_MS } from "../dashboard/period.js";
import type { KindState, Store, SyncState } from "./store.js";

/** Runs one GraphQL query and returns its `data`. */
export type GraphqlQuery = (query: string, variables: Record<string, string | number | null>) => Promise<unknown>;

export interface SyncOptions {
  store: Store;
  query: GraphqlQuery;
  repository: string;
  now?: () => number;
  /** Pull requests per call. 50 costs one point of GitHub's rate limit. */
  pageSize?: number;
  /** After each stored page, with the running count; open pages re-read on it. */
  onPage?: (stored: number) => void;
  signal?: AbortSignal;
}

export interface SyncResult {
  /** Pull requests stored in this run. */
  pullRequests: number;
  /** Issues stored in this run. */
  issues: number;
  /** Releases stored in this run, new or changed. */
  releases: number;
  /** GraphQL calls made. */
  calls: number;
}

interface PullRequestsPage {
  repository: { pullRequests: Connection<PullRequestNode> } | null;
}

interface ReleasesPage {
  repository: { releases: Connection<Release> } | null;
}

interface IssuesPage {
  repository: { issues: Connection<IssueNode> } | null;
}

/** What one object type needs to page itself down to the horizon. */
interface Pass<T extends { updatedAt: string }> {
  state: KindState;
  page: (after: string | null) => Promise<Connection<T>>;
  keep: (nodes: readonly T[]) => Promise<void>;
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { store, query, repository, signal } = options;
  const now = options.now ?? Date.now;
  const pageSize = options.pageSize ?? 50;
  const [owner, name] = repository.split("/");
  const state: SyncState = store.syncState(repository);
  const result: SyncResult = { pullRequests: 0, issues: 0, releases: 0, calls: 0 };

  async function call(text: string, variables: Record<string, string | number | null>) {
    signal?.throwIfAborted();
    result.calls += 1;
    return query(text, variables);
  }

  async function page(after: string | null): Promise<Connection<PullRequestNode>> {
    const data = (await call(PULL_REQUESTS_QUERY, { owner, name, first: pageSize, after })) as PullRequestsPage;
    if (data.repository === null) throw new Error(`GitHub has no repository ${repository}, or this login cannot see it.`);
    return data.repository.pullRequests;
  }

  /** The rare pull request with more than 100 reviews or events gets the rest one call at a time. */
  async function completeConnections(nodes: readonly PullRequestNode[]) {
    for (const node of nodes) {
      let reviews = node.reviews.pageInfo;
      while (reviews.hasNextPage) {
        const data = (await call(MORE_REVIEWS_QUERY, { id: node.id, after: reviews.endCursor })) as {
          node: { reviews: Connection<PullRequestReview> };
        };
        store.upsertReviews(node.id, data.node.reviews.nodes);
        reviews = data.node.reviews.pageInfo;
      }
      let timeline = node.timelineItems.pageInfo;
      while (timeline.hasNextPage) {
        const data = (await call(MORE_TIMELINE_QUERY, { id: node.id, after: timeline.endCursor })) as {
          node: { timelineItems: Connection<TimelineItem> };
        };
        store.upsertTimelineItems(node.id, data.node.timelineItems.nodes);
        timeline = data.node.timelineItems.pageInfo;
      }
    }
  }

  async function issuePage(after: string | null): Promise<Connection<IssueNode>> {
    const data = (await call(ISSUES_QUERY, { owner, name, first: pageSize, after })) as IssuesPage;
    if (data.repository === null) throw new Error(`GitHub has no repository ${repository}, or this login cannot see it.`);
    return data.repository.issues;
  }

  async function keepIssues(nodes: readonly IssueNode[]) {
    store.upsertIssues(repository, nodes);
    for (const node of nodes) {
      let timeline = node.timelineItems.pageInfo;
      while (timeline.hasNextPage) {
        const data = (await call(MORE_ISSUE_TIMELINE_QUERY, { id: node.id, after: timeline.endCursor })) as {
          node: { timelineItems: Connection<IssueTimelineItem> };
        };
        store.upsertIssueTimelineItems(node.id, data.node.timelineItems.nodes);
        timeline = data.node.timelineItems.pageInfo;
      }
    }
    result.issues += nodes.length;
    options.onPage?.(result.pullRequests + result.issues);
  }

  async function keep(nodes: readonly PullRequestNode[]) {
    store.upsertPullRequests(repository, nodes);
    await completeConnections(nodes);
    result.pullRequests += nodes.length;
    options.onPage?.(result.pullRequests);
  }

  /**
   * Releases have no update order to page by, and there are few of them, so
   * each sync reads the newest page again and keeps it whole. A release
   * edited after it fell off that page keeps its older notes. The first sync
   * reads on down to the horizon.
   */
  async function syncReleases() {
    const first = store.releaseCount(repository) === 0;
    const horizon = new Date(now() - BACKFILL_MS).toISOString();
    for (let after: string | null = null; ; ) {
      const data = (await call(RELEASES_QUERY, { owner, name, first: 100, after })) as ReleasesPage;
      if (data.repository === null) throw new Error(`GitHub has no repository ${repository}, or this login cannot see it.`);
      const { nodes, pageInfo } = data.repository.releases;
      const inRange = nodes.filter((release) => release.createdAt >= horizon);
      store.upsertReleases(repository, inRange);
      result.releases += inRange.length;
      if (!first || inRange.length < nodes.length || !pageInfo.hasNextPage) break;
      after = pageInfo.endCursor;
    }
  }

  const newest = <T extends { updatedAt: string }>(nodes: readonly T[], floor: string | null) =>
    nodes.reduce<string | null>((max, node) => (max === null || node.updatedAt > max ? node.updatedAt : max), floor);

  /** One object type: catch up to its high-water mark, then backfill once. */
  async function run<T extends { updatedAt: string }>({ state: kind, page: fetch, keep: store_ }: Pass<T>) {
    // Catch up on everything updated since the last completed pass.
    if (kind.highWater !== null) {
      const stopAt = kind.highWater;
      let highWater = stopAt;
      for (let after: string | null = null; ; ) {
        const { nodes, pageInfo } = await fetch(after);
        const fresh = nodes.filter((node) => node.updatedAt > stopAt);
        await store_(fresh);
        highWater = newest(fresh, highWater) ?? highWater;
        if (fresh.length < nodes.length || !pageInfo.hasNextPage) break;
        after = pageInfo.endCursor;
      }
      kind.highWater = highWater;
      store.saveSyncState(repository, state);
    }

    // Backfill, the first time, down to the horizon.
    if (!kind.backfillDone) {
      const horizon = new Date(now() - BACKFILL_MS).toISOString();
      for (let after = kind.backfillCursor; ; ) {
        const { nodes, pageInfo } = await fetch(after);
        const inRange = nodes.filter((node) => node.updatedAt >= horizon);
        await store_(inRange);
        if (after === null) kind.highWater = newest(inRange, kind.highWater);
        if (inRange.length < nodes.length || !pageInfo.hasNextPage) break;
        after = pageInfo.endCursor;
        kind.backfillCursor = after;
        store.saveSyncState(repository, state);
      }
      kind.backfillDone = true;
      kind.backfillCursor = null;
      // An empty repository still needs a mark, or later passes would never start.
      kind.highWater ??= horizon;
    }
  }

  await run<PullRequestNode>({ state, page, keep });
  await run<IssueNode>({ state: state.issues, page: issuePage, keep: keepIssues });
  await syncReleases();

  state.syncedAt = now();
  store.saveSyncState(repository, state);
  return result;
}
