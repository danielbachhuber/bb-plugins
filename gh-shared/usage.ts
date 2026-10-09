import type { GhRunner } from "./gh.js";

/**
 * What a plugin's syncs cost against GitHub's GraphQL rate limit, for the
 * sync status in its title bar.
 *
 * GitHub charges GraphQL by points, 5,000 an hour per account, shared by
 * every plugin and every `gh` command an agent runs. A call's points depend
 * on how many nodes its query could return, so a count of calls says little:
 * a sweep of 5 calls can cost 100 points while one of 2 costs 4.
 *
 * Nothing here can ask GitHub what one `gh pr list` cost, because gh builds
 * that query itself. Instead the budget is read before and after a sync and
 * the difference is the sync's cost. Reading `rateLimit` costs no points.
 * The difference also counts anything else spending from the account during
 * those seconds, so it is an upper bound, close in practice because a sync
 * takes a few seconds.
 */
export interface GraphqlBudget {
  used: number;
  limit: number;
  /** When this hour's window ends, in milliseconds. */
  resetAt: number;
}

/** One sync, as the sync status draws it. */
export interface SyncSample {
  /** When the sync started, in milliseconds. */
  at: number;
  /** GraphQL points it used, or null when the two readings could not be compared. */
  points: number | null;
  /** gh invocations it made, not counting the budget readings. */
  calls: number;
  ms: number;
}

/** The past hour of syncs, and the account's budget as of the last one. */
export interface SyncUsage {
  syncs: SyncSample[];
  budget: GraphqlBudget | null;
}

const HOUR = 3_600_000;

/**
 * GitHub answers from two counters with different windows, and about one
 * reading in ten comes from the less common one. Two readings before a sync
 * and up to three after almost always give a pair from the same counter.
 */
const BEFORE_READINGS = 2;
const AFTER_ATTEMPTS = 3;

const BUDGET_QUERY = "query{rateLimit{used limit resetAt}}";

/** The account's GraphQL budget, or null when it could not be read. */
export async function readBudget(gh: GhRunner): Promise<GraphqlBudget | null> {
  try {
    const raw = await gh.run(["api", "graphql", "-f", `query=${BUDGET_QUERY}`]);
    const limit = (JSON.parse(raw) as { data?: { rateLimit?: unknown } }).data?.rateLimit as
      | { used?: unknown; limit?: unknown; resetAt?: unknown }
      | undefined;
    const resetAt = typeof limit?.resetAt === "string" ? Date.parse(limit.resetAt) : NaN;
    if (typeof limit?.used !== "number" || typeof limit.limit !== "number" || Number.isNaN(resetAt)) {
      return null;
    }
    return { used: limit.used, limit: limit.limit, resetAt };
  } catch {
    return null;
  }
}

/**
 * Points spent between two readings, or null when they cannot be compared.
 *
 * Two readings from the same window subtract. When the window ended during
 * the sync, everything used in the new window counts, which may include a
 * little from other callers. Readings from GitHub's other counter, whose
 * window ends at a different time, do not compare.
 */
export function pointsBetween(
  before: GraphqlBudget,
  after: GraphqlBudget,
  afterReadAt: number,
): number | null {
  if (after.resetAt === before.resetAt) return Math.max(0, after.used - before.used);
  if (before.resetAt <= afterReadAt && after.resetAt > before.resetAt) return after.used;
  return null;
}

/** A runner that counts what passes through it. */
function counting(gh: GhRunner): { runner: GhRunner; calls: () => number } {
  let calls = 0;
  return {
    runner: {
      run(args) {
        calls += 1;
        return gh.run(args);
      },
    },
    calls: () => calls,
  };
}

/**
 * Keeps the past hour of a plugin's syncs, in memory. A restart starts the
 * hour over, which costs nothing but an emptier chart for an hour.
 */
export function createSyncUsage(now: () => number = Date.now) {
  let syncs: SyncSample[] = [];
  let budget: GraphqlBudget | null = null;

  const prune = (at: number) => {
    syncs = syncs.filter((sync) => sync.at > at - HOUR);
  };

  return {
    /**
     * Runs one sync with a counting runner, and records what it cost whether
     * it succeeds or throws.
     */
    async measure<T>(gh: GhRunner, sync: (gh: GhRunner) => Promise<T>): Promise<T> {
      const at = now();
      const befores: GraphqlBudget[] = [];
      for (let reading = 0; reading < BEFORE_READINGS; reading += 1) {
        const budgetNow = await readBudget(gh);
        if (budgetNow !== null) befores.push(budgetNow);
      }
      const { runner, calls } = counting(gh);
      try {
        return await sync(runner);
      } finally {
        const ms = now() - at;
        let points: number | null = null;
        let latest: GraphqlBudget | null = null;
        for (let attempt = 0; befores.length > 0 && attempt < AFTER_ATTEMPTS && points === null; attempt += 1) {
          const after = await readBudget(gh);
          if (after === null) continue;
          latest = after;
          const readAt = now();
          // A reading from the same window first, so a reading from the other
          // counter is never read as a window that ended mid-sync.
          const same = befores.find((before) => before.resetAt === after.resetAt);
          for (const before of same ? [same] : befores) points ??= pointsBetween(before, after, readAt);
        }
        budget = latest ?? befores[0] ?? budget;
        syncs.push({ at, points, calls: calls(), ms });
        prune(now());
      }
    },

    snapshot(): SyncUsage {
      prune(now());
      return { syncs: [...syncs], budget };
    },
  };
}

export type SyncUsageLog = ReturnType<typeof createSyncUsage>;
