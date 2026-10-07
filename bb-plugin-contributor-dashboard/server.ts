// bb-plugin-contributor-dashboard — mirrors a repository's pull requests and reviews
// from GitHub, and serves the Contributor Dashboard page from that mirror.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createGhRunner, GhUnavailableError, REPO_SLUG_PATTERN } from "@danielb/gh-shared/gh";

import { rpcContract, DASHBOARD_CHANNEL, type SyncStatus } from "./dashboard/contract.js";
import { ghGraphql } from "./mirror/gh.js";
import { peopleActivity } from "./review/people.js";
import { authoredPullRequests, awaitingReview } from "./review/person.js";
import { bucketsFor } from "./dashboard/period.js";
import { createStore, MIGRATIONS } from "./mirror/store.js";
import { runSync } from "./mirror/sync.js";

export { rpcContract };

/** Opening the page syncs when the mirror is older than this. */
const STALE_AFTER_MS = 30 * 60_000;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    repository: {
      type: "string",
      label: "Repository",
      description: "The repository to chart, as owner/name.",
      default: "",
    },
    ghPath: {
      type: "string",
      label: "Path to the gh CLI",
      default: "gh",
    },
  });
  const { repository: rawRepository, ghPath } = await settings.get();
  const repository = rawRepository.trim();
  const configured = REPO_SLUG_PATTERN.test(repository);
  if (repository !== "" && !configured) bb.log.warn(`repository setting "${repository}" is not owner/name`);

  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db as never);
  const query = ghGraphql(createGhRunner(ghPath));

  const aborter = new AbortController();
  bb.onDispose(() => aborter.abort());

  let running: Promise<void> | null = null;
  let lastError: string | null = null;

  function status(): SyncStatus {
    const state = store.syncState(repository);
    return {
      syncedAt: state.syncedAt,
      running: running !== null,
      backfillDone: state.backfillDone,
      pullRequests: configured ? store.pullRequestCount(repository) : 0,
      error: lastError,
    };
  }

  /** Starts a sync unless one is running; callers share the one in flight. */
  function startSync(): void {
    if (!configured || running !== null) return;
    const started = Date.now();
    running = runSync({
      store,
      query,
      repository,
      signal: aborter.signal,
      onPage: () => bb.realtime.publish(DASHBOARD_CHANNEL, null),
    })
      .then((result) => {
        lastError = null;
        bb.log.info(
          `synced ${repository}: ${result.pullRequests} pull requests in ${result.calls} calls, ${Date.now() - started} ms`,
        );
      })
      .catch((error: unknown) => {
        if (aborter.signal.aborted) return;
        lastError = error instanceof GhUnavailableError ? error.message : `Sync failed: ${messageOf(error)}`;
        bb.log.warn(`sync of ${repository} failed: ${error instanceof GhUnavailableError ? error.detail : messageOf(error)}`);
      })
      .finally(() => {
        running = null;
        if (!aborter.signal.aborted) bb.realtime.publish(DASHBOARD_CHANNEL, null);
      });
  }

  bb.rpc.register(rpcContract, {
    people_activity: ({ period }) => {
      if (!configured) {
        return { repository: null, buckets: [], people: [], sync: status() };
      }
      const { syncedAt } = store.syncState(repository);
      if (syncedAt === null || Date.now() - syncedAt > STALE_AFTER_MS) startSync();
      const buckets = bucketsFor(period, Date.now());
      const prs = store.readActivity(repository, buckets[0].start);
      return { repository, buckets, people: peopleActivity(prs, buckets), sync: status() };
    },
    person_activity: ({ login, period }) => {
      if (!configured) {
        return { repository: null, login, buckets: [], activity: null, awaiting: [], authored: [], sync: status() };
      }
      const { syncedAt } = store.syncState(repository);
      if (syncedAt === null || Date.now() - syncedAt > STALE_AFTER_MS) startSync();
      const now = Date.now();
      const buckets = bucketsFor(period, now);
      const prs = store.readActivity(repository, buckets[0].start);
      return {
        repository,
        login,
        buckets,
        activity: peopleActivity(prs, buckets).find((person) => person.login === login) ?? null,
        // Open pull requests are waiting now, whatever the period, so this
        // reads every stored one rather than only the period's.
        awaiting: awaitingReview(store.readActivity(repository, 0), login, now),
        authored: authoredPullRequests(prs, login, buckets[0].start, now),
        sync: status(),
      };
    },
    sync_now: () => {
      startSync();
      return status();
    },
  });
}
