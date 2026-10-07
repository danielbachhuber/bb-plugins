// A local mirror of the GitHub objects this plugin reads.
//
// One table per GitHub object type, keyed by GitHub's node id. Each row keeps
// the whole object as GitHub returned it in `data`, with GitHub's field names,
// and promotes only the few fields queries filter or join on into columns.
// Reading a new field later means asking GitHub for it and reading it out of
// `data`; the tables do not change. Metrics are computed when the page reads,
// never stored, so changing how one is defined never needs a refetch.
import type { Database } from "better-sqlite3";

import type {
  PullRequest,
  PullRequestNode,
  PullRequestReview,
  PullRequestWithActivity,
  TimelineItem,
} from "./github.js";

/**
 * APPEND-ONLY. Statement index is the migration id. Never edit or reorder a
 * shipped statement; only push new ones.
 */
export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS pull_requests (
     id TEXT PRIMARY KEY,
     repository TEXT NOT NULL,
     number INTEGER NOT NULL,
     updated_at TEXT NOT NULL,
     data TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS pull_requests_repository_updated_idx ON pull_requests (repository, updated_at)`,
  `CREATE TABLE IF NOT EXISTS pull_request_reviews (
     id TEXT PRIMARY KEY,
     pull_request_id TEXT NOT NULL,
     data TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS pull_request_reviews_pr_idx ON pull_request_reviews (pull_request_id)`,
  `CREATE TABLE IF NOT EXISTS pull_request_timeline_items (
     id TEXT PRIMARY KEY,
     pull_request_id TEXT NOT NULL,
     data TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS pull_request_timeline_items_pr_idx ON pull_request_timeline_items (pull_request_id)`,
  // How far each repository's sync has got. Not a GitHub object.
  `CREATE TABLE IF NOT EXISTS sync_state (
     repository TEXT PRIMARY KEY,
     high_water TEXT,
     backfill_cursor TEXT,
     backfill_done INTEGER NOT NULL DEFAULT 0,
     synced_at INTEGER
   )`,
];

export interface SyncState {
  /** The newest `updatedAt` a completed pass has reached; later passes stop here. */
  highWater: string | null;
  /** Where an unfinished backfill resumes. */
  backfillCursor: string | null;
  backfillDone: boolean;
  /** When the last sync finished, epoch ms. */
  syncedAt: number | null;
}

export type Store = ReturnType<typeof createStore>;

function withoutConnections(node: PullRequestNode): PullRequest {
  const { reviews: _reviews, timelineItems: _timelineItems, ...pullRequest } = node;
  return pullRequest;
}

export function createStore(db: Database) {
  const upsertPr = db.prepare(
    `INSERT INTO pull_requests (id, repository, number, updated_at, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET repository = excluded.repository, number = excluded.number,
       updated_at = excluded.updated_at, data = excluded.data`,
  );
  const upsertReview = db.prepare(
    `INSERT INTO pull_request_reviews (id, pull_request_id, data) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET pull_request_id = excluded.pull_request_id, data = excluded.data`,
  );
  const upsertTimelineItem = db.prepare(
    `INSERT INTO pull_request_timeline_items (id, pull_request_id, data) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET pull_request_id = excluded.pull_request_id, data = excluded.data`,
  );
  const selectPrs = db.prepare(
    `SELECT id, data FROM pull_requests WHERE repository = ? AND updated_at >= ? ORDER BY number`,
  );
  const selectReviews = db.prepare(
    `SELECT r.pull_request_id AS pr, r.data FROM pull_request_reviews r
     JOIN pull_requests p ON p.id = r.pull_request_id
     WHERE p.repository = ? AND p.updated_at >= ?`,
  );
  const selectTimeline = db.prepare(
    `SELECT t.pull_request_id AS pr, t.data FROM pull_request_timeline_items t
     JOIN pull_requests p ON p.id = t.pull_request_id
     WHERE p.repository = ? AND p.updated_at >= ?`,
  );
  const selectRawPr = db.prepare(`SELECT data FROM pull_requests WHERE id = ?`);
  const selectState = db.prepare(`SELECT * FROM sync_state WHERE repository = ?`);
  const upsertState = db.prepare(
    `INSERT INTO sync_state (repository, high_water, backfill_cursor, backfill_done, synced_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (repository) DO UPDATE SET high_water = excluded.high_water,
       backfill_cursor = excluded.backfill_cursor, backfill_done = excluded.backfill_done,
       synced_at = excluded.synced_at`,
  );
  const countPrs = db.prepare(`SELECT COUNT(*) AS n FROM pull_requests WHERE repository = ?`);

  const writeReviews = (pullRequestId: string, reviews: readonly PullRequestReview[]) => {
    for (const review of reviews) upsertReview.run(review.id, pullRequestId, JSON.stringify(review));
  };
  const writeTimeline = (pullRequestId: string, items: readonly TimelineItem[]) => {
    for (const item of items) upsertTimelineItem.run(item.id, pullRequestId, JSON.stringify(item));
  };

  return {
    /** One page of pull requests, with the reviews and events that came with it. */
    upsertPullRequests: db.transaction((repository: string, nodes: readonly PullRequestNode[]) => {
      for (const node of nodes) {
        upsertPr.run(node.id, repository, node.number, node.updatedAt, JSON.stringify(withoutConnections(node)));
        writeReviews(node.id, node.reviews.nodes);
        writeTimeline(node.id, node.timelineItems.nodes);
      }
    }),
    upsertReviews: db.transaction(writeReviews),
    upsertTimelineItems: db.transaction(writeTimeline),

    /** Every pull request updated at or after `since`, with its reviews and events. */
    readActivity(repository: string, since: number): PullRequestWithActivity[] {
      const sinceIso = new Date(since).toISOString();
      const prs = new Map<string, PullRequestWithActivity>();
      for (const row of selectPrs.all(repository, sinceIso) as Array<{ id: string; data: string }>) {
        prs.set(row.id, { ...(JSON.parse(row.data) as PullRequest), reviews: [], timelineItems: [] });
      }
      for (const row of selectReviews.all(repository, sinceIso) as Array<{ pr: string; data: string }>) {
        prs.get(row.pr)?.reviews.push(JSON.parse(row.data) as PullRequestReview);
      }
      for (const row of selectTimeline.all(repository, sinceIso) as Array<{ pr: string; data: string }>) {
        prs.get(row.pr)?.timelineItems.push(JSON.parse(row.data) as TimelineItem);
      }
      for (const pr of prs.values()) {
        pr.reviews.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        pr.timelineItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return [...prs.values()];
    },

    /** The stored JSON for one pull request, as GitHub returned it. */
    rawPullRequest(id: string): string | null {
      return (selectRawPr.get(id) as { data: string } | undefined)?.data ?? null;
    },

    pullRequestCount(repository: string): number {
      return (countPrs.get(repository) as { n: number }).n;
    },

    syncState(repository: string): SyncState {
      const row = selectState.get(repository) as
        | { high_water: string | null; backfill_cursor: string | null; backfill_done: number; synced_at: number | null }
        | undefined;
      return {
        highWater: row?.high_water ?? null,
        backfillCursor: row?.backfill_cursor ?? null,
        backfillDone: row?.backfill_done === 1,
        syncedAt: row?.synced_at ?? null,
      };
    },

    saveSyncState(repository: string, state: SyncState): void {
      upsertState.run(repository, state.highWater, state.backfillCursor, state.backfillDone ? 1 : 0, state.syncedAt);
    },
  };
}
