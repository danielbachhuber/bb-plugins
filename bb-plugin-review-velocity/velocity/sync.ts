// Mirrors one repository's pull requests into the store.
//
// GitHub returns pull requests most recently updated first, and any review or
// review request bumps a pull request's updatedAt. So each sync pages down from
// the top until it reaches what the last sync already saw (the high-water
// mark). The first sync instead backfills down to BACKFILL_MS ago, saving its
// cursor after every page so an interrupted backfill resumes where it stopped.
import {
  MORE_REVIEWS_QUERY,
  MORE_TIMELINE_QUERY,
  PULL_REQUESTS_QUERY,
  type Connection,
  type PullRequestNode,
  type PullRequestReview,
  type TimelineItem,
} from "./github.js";
import { BACKFILL_MS } from "./period.js";
import type { Store, SyncState } from "./store.js";

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
  /** GraphQL calls made. */
  calls: number;
}

interface PullRequestsPage {
  repository: { pullRequests: Connection<PullRequestNode> } | null;
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { store, query, repository, signal } = options;
  const now = options.now ?? Date.now;
  const pageSize = options.pageSize ?? 50;
  const [owner, name] = repository.split("/");
  const state: SyncState = store.syncState(repository);
  const result: SyncResult = { pullRequests: 0, calls: 0 };

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

  async function keep(nodes: readonly PullRequestNode[]) {
    store.upsertPullRequests(repository, nodes);
    await completeConnections(nodes);
    result.pullRequests += nodes.length;
    options.onPage?.(result.pullRequests);
  }

  const newest = (nodes: readonly PullRequestNode[], floor: string | null) =>
    nodes.reduce<string | null>((max, node) => (max === null || node.updatedAt > max ? node.updatedAt : max), floor);

  // Catch up on everything updated since the last completed pass.
  if (state.highWater !== null) {
    const stopAt = state.highWater;
    let highWater = stopAt;
    for (let after: string | null = null; ; ) {
      const { nodes, pageInfo } = await page(after);
      const fresh = nodes.filter((node) => node.updatedAt > stopAt);
      await keep(fresh);
      highWater = newest(fresh, highWater) ?? highWater;
      if (fresh.length < nodes.length || !pageInfo.hasNextPage) break;
      after = pageInfo.endCursor;
    }
    state.highWater = highWater;
    store.saveSyncState(repository, state);
  }

  // Backfill, the first time, down to the horizon.
  if (!state.backfillDone) {
    const horizon = new Date(now() - BACKFILL_MS).toISOString();
    for (let after = state.backfillCursor; ; ) {
      const { nodes, pageInfo } = await page(after);
      const inRange = nodes.filter((node) => node.updatedAt >= horizon);
      await keep(inRange);
      if (after === null) state.highWater = newest(inRange, state.highWater);
      if (inRange.length < nodes.length || !pageInfo.hasNextPage) break;
      after = pageInfo.endCursor;
      state.backfillCursor = after;
      store.saveSyncState(repository, state);
    }
    state.backfillDone = true;
    state.backfillCursor = null;
    // An empty repository still needs a mark, or later passes would never start.
    state.highWater ??= horizon;
  }

  state.syncedAt = now();
  store.saveSyncState(repository, state);
  return result;
}
