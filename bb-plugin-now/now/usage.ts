// What Now's syncs and buttons cost in calls to each service, for the sync
// status in the title bar. In memory only: a restart starts the hour over.
import type { SyncUsage } from "component-library/sync-status";

const HOUR = 3_600_000;

/** gh and gws runners alike: an argument list in, stdout out. */
type Runner = (args: string[]) => Promise<string>;

/** GitHub's GraphQL budget, as a query that asks for `rateLimit` reports it. */
export interface GraphqlBudget {
  used: number;
  limit: number;
  resetAt: number;
}

/** Which service a gws command calls, from its first argument. */
export function gwsService(args: readonly string[]): string {
  if (args[0] === "gmail") return "Gmail";
  if (args[0] === "calendar") return "Calendar";
  if (args[0] === "drive" || args[0] === "docs") return "Drive";
  return "Google";
}

/**
 * The `rateLimit` a GraphQL response carries, or null. Now asks for it in
 * its one GitHub query, so the query's cost is GitHub's own figure rather
 * than a difference between two readings.
 */
export function rateLimitOf(stdout: string): { cost: number; budget: GraphqlBudget } | null {
  if (!stdout.includes('"rateLimit"')) return null;
  try {
    const limit = (JSON.parse(stdout) as { data?: { rateLimit?: Record<string, unknown> } }).data?.rateLimit;
    const resetAt = typeof limit?.resetAt === "string" ? Date.parse(limit.resetAt) : NaN;
    if (
      typeof limit?.cost !== "number" ||
      typeof limit.used !== "number" ||
      typeof limit.limit !== "number" ||
      Number.isNaN(resetAt)
    ) {
      return null;
    }
    return { cost: limit.cost, budget: { used: limit.used, limit: limit.limit, resetAt } };
  } catch {
    return null;
  }
}

export function createCallLog(now: () => number) {
  let calls: { at: number; service: string }[] = [];
  let costs: { at: number; cost: number }[] = [];
  let syncs: { at: number; ms: number | null }[] = [];
  let budget: GraphqlBudget | null = null;

  function prune(at: number) {
    calls = calls.filter((call) => call.at > at - HOUR);
    costs = costs.filter((cost) => cost.at > at - HOUR);
    syncs = syncs.filter((sync) => sync.at > at - HOUR);
  }

  function record(service: string) {
    calls.push({ at: now(), service });
  }

  function recordGitHub(stdout: string) {
    const found = rateLimitOf(stdout);
    if (found === null) return;
    costs.push({ at: now(), cost: found.cost });
    budget = found.budget;
  }

  return {
    /** Wraps a runner taking argument lists, naming each call's service. */
    countRunner(run: Runner, service: (args: string[]) => string): Runner {
      return async (args: string[]) => {
        record(service(args));
        try {
          const stdout = await run(args);
          if (service(args) === "GitHub") recordGitHub(stdout);
          return stdout;
        } catch (error) {
          // gh exits non-zero on a partial GraphQL error but still prints the body.
          const stdout = (error as { stdout?: unknown }).stdout;
          if (service(args) === "GitHub" && typeof stdout === "string") recordGitHub(stdout);
          throw error;
        }
      };
    },

    /** Wraps fetch, counting every request as one call to `service`. */
    countFetch(fetchImpl: typeof fetch, service: string): typeof fetch {
      return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        record(service);
        return fetchImpl(input, init);
      }) as typeof fetch;
    },

    /** Marks a sync starting, and returns the function that marks it done. */
    startSync(): () => void {
      const sync = { at: now(), ms: null as number | null };
      syncs.push(sync);
      return () => {
        sync.ms = now() - sync.at;
        prune(now());
      };
    },

    /**
     * The past hour, with each call counted in the sync it ran during, and
     * the rest as calls outside syncs. A click made during a sync counts as
     * the sync's.
     */
    snapshot(): SyncUsage {
      const at = now();
      prune(at);
      const windows = syncs.map((sync) => ({ ...sync, end: sync.ms === null ? at : sync.at + sync.ms }));
      const within = (time: number) => windows.findIndex((window) => time >= window.at && time <= window.end);
      const perSync = windows.map(() => ({ services: {} as Record<string, number>, calls: 0, points: 0 }));
      const otherCalls: Record<string, number> = {};
      for (const call of calls) {
        const index = within(call.at);
        const bucket = index === -1 ? otherCalls : perSync[index]!.services;
        bucket[call.service] = (bucket[call.service] ?? 0) + 1;
        if (index !== -1) perSync[index]!.calls += 1;
      }
      for (const cost of costs) {
        const index = within(cost.at);
        if (index !== -1) perSync[index]!.points += cost.cost;
      }
      return {
        syncs: windows
          .filter((window) => window.ms !== null)
          .map((window) => {
            const counted = perSync[windows.indexOf(window)]!;
            return { at: window.at, ms: window.ms!, calls: counted.calls, points: counted.points, services: counted.services };
          }),
        budget,
        otherCalls,
      };
    },
  };
}
