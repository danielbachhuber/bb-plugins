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
  Issue,
  IssueNode,
  IssueTimelineItem,
  IssueWithActivity,
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
  `CREATE TABLE IF NOT EXISTS issues (
     id TEXT PRIMARY KEY,
     repository TEXT NOT NULL,
     number INTEGER NOT NULL,
     updated_at TEXT NOT NULL,
     data TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS issues_repository_updated_idx ON issues (repository, updated_at)`,
  `CREATE TABLE IF NOT EXISTS issue_timeline_items (
     id TEXT PRIMARY KEY,
     issue_id TEXT NOT NULL,
     data TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS issue_timeline_items_issue_idx ON issue_timeline_items (issue_id)`,
  // Issues sync separately from pull requests, so they keep their own marks.
  `ALTER TABLE sync_state ADD COLUMN issue_high_water TEXT`,
  `ALTER TABLE sync_state ADD COLUMN issue_backfill_cursor TEXT`,
  `ALTER TABLE sync_state ADD COLUMN issue_backfill_done INTEGER NOT NULL DEFAULT 0`,
  // The threads this plugin started, so a row can offer to open its own
  // thread rather than start a second one. Not part of the mirror: nothing
  // here comes from GitHub.
  `CREATE TABLE IF NOT EXISTS threads (
     repository TEXT NOT NULL,
     kind TEXT NOT NULL,
     number INTEGER NOT NULL,
     thread_id TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     PRIMARY KEY (repository, kind, number)
   )`,
];

/** One object type's progress through the repository. */
export interface KindState {
  /** The newest `updatedAt` a completed pass has reached; later passes stop here. */
  highWater: string | null;
  /** Where an unfinished backfill resumes. */
  backfillCursor: string | null;
  backfillDone: boolean;
}

export interface SyncState extends KindState {
  issues: KindState;
  /** When the last sync finished, epoch ms. */
  syncedAt: number | null;
}

/** What a row was started from: an issue or a pull request. */
export type ThreadKind = "issue" | "pull";

export type Store = ReturnType<typeof createStore>;

function withoutConnections(node: PullRequestNode): PullRequest {
  const { reviews: _reviews, timelineItems: _timelineItems, assignees, ...pullRequest } = node;
  // Assignees arrive as a connection and are stored as the plain list a row draws.
  return { ...pullRequest, assignees: assignees?.nodes ?? [] };
}

function issueWithoutConnections(node: IssueNode): Issue {
  const { timelineItems: _timelineItems, assignees, ...issue } = node;
  return { ...issue, assignees: assignees?.nodes ?? [] };
}

export function createStore(db: Database) {
  const linkThread = db.prepare(
    `INSERT INTO threads (repository, kind, number, thread_id, started_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (repository, kind, number) DO UPDATE SET thread_id = excluded.thread_id,
       started_at = excluded.started_at`,
  );
  const selectThreads = db.prepare(`SELECT number, thread_id FROM threads WHERE repository = ? AND kind = ?`);
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
    `INSERT INTO sync_state
       (repository, high_water, backfill_cursor, backfill_done, synced_at,
        issue_high_water, issue_backfill_cursor, issue_backfill_done)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (repository) DO UPDATE SET high_water = excluded.high_water,
       backfill_cursor = excluded.backfill_cursor, backfill_done = excluded.backfill_done,
       synced_at = excluded.synced_at, issue_high_water = excluded.issue_high_water,
       issue_backfill_cursor = excluded.issue_backfill_cursor,
       issue_backfill_done = excluded.issue_backfill_done`,
  );
  const countPrs = db.prepare(`SELECT COUNT(*) AS n FROM pull_requests WHERE repository = ?`);
  const upsertIssue = db.prepare(
    `INSERT INTO issues (id, repository, number, updated_at, data) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET repository = excluded.repository, number = excluded.number,
       updated_at = excluded.updated_at, data = excluded.data`,
  );
  const upsertIssueItem = db.prepare(
    `INSERT INTO issue_timeline_items (id, issue_id, data) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET issue_id = excluded.issue_id, data = excluded.data`,
  );
  const selectIssues = db.prepare(
    `SELECT id, data FROM issues WHERE repository = ? AND updated_at >= ? ORDER BY number`,
  );
  const selectIssueItems = db.prepare(
    `SELECT t.issue_id AS issue, t.data FROM issue_timeline_items t
     JOIN issues i ON i.id = t.issue_id
     WHERE i.repository = ? AND i.updated_at >= ?`,
  );
  const countIssues = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE repository = ?`);

  const writeIssueItems = (issueId: string, items: readonly IssueTimelineItem[]) => {
    for (const item of items) upsertIssueItem.run(item.id, issueId, JSON.stringify(item));
  };

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

    /** Remember the thread a row started, replacing any earlier one. */
    linkThread(repository: string, kind: ThreadKind, number: number, threadId: string) {
      linkThread.run(repository, kind, number, threadId, Date.now());
    },

    /** Every row in this repository that has a thread, as number to thread id. */
    threadsFor(repository: string, kind: ThreadKind): Map<number, string> {
      const rows = selectThreads.all(repository, kind) as Array<{ number: number; thread_id: string }>;
      return new Map(rows.map((row) => [row.number, row.thread_id]));
    },

    /** One page of issues, with the events that came with them. */
    upsertIssues: db.transaction((repository: string, nodes: readonly IssueNode[]) => {
      for (const node of nodes) {
        upsertIssue.run(node.id, repository, node.number, node.updatedAt, JSON.stringify(issueWithoutConnections(node)));
        writeIssueItems(node.id, node.timelineItems.nodes);
      }
    }),
    upsertIssueTimelineItems: db.transaction(writeIssueItems),
    upsertTimelineItems: db.transaction(writeTimeline),

    /** Every pull request updated at or after `since`, with its reviews and events. */
    readActivity(repository: string, since: number): PullRequestWithActivity[] {
      const sinceIso = new Date(since).toISOString();
      const prs = new Map<string, PullRequestWithActivity>();
      for (const row of selectPrs.all(repository, sinceIso) as Array<{ id: string; data: string }>) {
        const stored = JSON.parse(row.data) as PullRequest;
        // A row mirrored before assignees were asked for has no such field.
        prs.set(row.id, { ...stored, assignees: stored.assignees ?? [], reviews: [], timelineItems: [] });
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

    /** Every issue updated at or after `since`, with its events. */
    readIssues(repository: string, since: number): IssueWithActivity[] {
      const sinceIso = new Date(since).toISOString();
      const issues = new Map<string, IssueWithActivity>();
      for (const row of selectIssues.all(repository, sinceIso) as Array<{ id: string; data: string }>) {
        issues.set(row.id, { ...(JSON.parse(row.data) as Issue), timelineItems: [] });
      }
      for (const row of selectIssueItems.all(repository, sinceIso) as Array<{ issue: string; data: string }>) {
        issues.get(row.issue)?.timelineItems.push(JSON.parse(row.data) as IssueTimelineItem);
      }
      for (const issue of issues.values()) {
        issue.timelineItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return [...issues.values()];
    },

    issueCount(repository: string): number {
      return (countIssues.get(repository) as { n: number }).n;
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
        | {
            high_water: string | null;
            backfill_cursor: string | null;
            backfill_done: number;
            issue_high_water: string | null;
            issue_backfill_cursor: string | null;
            issue_backfill_done: number;
            synced_at: number | null;
          }
        | undefined;
      return {
        highWater: row?.high_water ?? null,
        backfillCursor: row?.backfill_cursor ?? null,
        backfillDone: row?.backfill_done === 1,
        issues: {
          highWater: row?.issue_high_water ?? null,
          backfillCursor: row?.issue_backfill_cursor ?? null,
          backfillDone: row?.issue_backfill_done === 1,
        },
        syncedAt: row?.synced_at ?? null,
      };
    },

    saveSyncState(repository: string, state: SyncState): void {
      upsertState.run(
        repository,
        state.highWater,
        state.backfillCursor,
        state.backfillDone ? 1 : 0,
        state.syncedAt,
        state.issues.highWater,
        state.issues.backfillCursor,
        state.issues.backfillDone ? 1 : 0,
      );
    },
  };
}
