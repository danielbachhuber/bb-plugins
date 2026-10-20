// bb-plugin-contributor-dashboard — mirrors a repository's pull requests and reviews
// from GitHub, and serves the Contributor Dashboard page from that mirror.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createGhRunner, createSyncUsage, GhUnavailableError, REPO_SLUG_PATTERN } from "@danielb/gh-shared/gh";
import { matchProjectForRepo, toProjectCandidates } from "@danielb/gh-shared/projects";

import { rpcContract, DASHBOARD_CHANNEL, type SyncStatus } from "./dashboard/contract.js";
import { ghGraphql } from "./mirror/gh.js";
import { authorActivity } from "./review/authors.js";
import { peopleActivity } from "./review/people.js";
import { flowOf, emptyFlow } from "./review/flow.js";
import { olderReleases, releaseSummaries } from "./review/releases.js";
import { stageDetail, stageSummaries } from "./review/stages.js";
import { mergeFlows, reviewFlows } from "./review/flows.js";
import { authoredPullRequests, awaitingReview } from "./review/person.js";
import { openItems } from "./review/open-items.js";
import { AUTHORED_PAGE_SIZE, PAGE_SIZE, pageOf } from "./dashboard/paging.js";
import { bucketsFor } from "./dashboard/period.js";
import { createStore, MIGRATIONS, type ThreadKind } from "./mirror/store.js";
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
  const gh = createGhRunner(ghPath);
  // The past hour of syncs and what each cost, for the header's summary.
  // Every GitHub call the plugin makes is inside a sync.
  const syncUsage = createSyncUsage();

  const aborter = new AbortController();
  bb.onDispose(() => aborter.abort());

  // A row whose thread has been archived or deleted offers to start a new one
  // rather than opening a thread that is gone.
  for (const event of ["thread.archived", "thread.deleted"] as const) {
    bb.events.on(event, ({ thread }) => {
      if (store.releaseThread(thread.id) > 0) bb.realtime.publish(DASHBOARD_CHANNEL, { releasedAt: Date.now() });
    });
  }

  // The events fire only while this plugin runs, so a thread archived while
  // bb was stopped is caught here, against the threads bb still has.
  void (async () => {
    try {
      const live = new Set<string>();
      const pageSize = 100;
      for (let offset = 0; ; offset += pageSize) {
        const page = await bb.sdk.threads.list({ archived: false, includeHidden: true, limit: pageSize, offset });
        for (const thread of page) live.add(thread.id);
        if (page.length < pageSize) break;
      }
      const released = store.releaseThreadsExcept(live);
      if (released > 0) {
        bb.log.info(`released ${released} links to archived or deleted threads`);
        bb.realtime.publish(DASHBOARD_CHANNEL, { releasedAt: Date.now() });
      }
    } catch (cause) {
      bb.log.warn(`could not check thread links: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  })();

  let running: Promise<void> | null = null;
  let lastError: string | null = null;

  function status(): SyncStatus {
    const state = store.syncState(repository);
    return {
      syncedAt: state.syncedAt,
      running: running !== null,
      backfillDone: state.backfillDone && state.issues.backfillDone,
      pullRequests: configured ? store.pullRequestCount(repository) : 0,
      issues: configured ? store.issueCount(repository) : 0,
      error: lastError,
      usage: syncUsage.snapshot(),
    };
  }

  /** Starts a sync unless one is running; callers share the one in flight. */
  function startSync(): void {
    if (!configured || running !== null) return;
    const started = Date.now();
    running = syncUsage
      .measure(gh, (counted) =>
        runSync({
          store,
          query: ghGraphql(counted),
          repository,
          signal: aborter.signal,
          onPage: () => bb.realtime.publish(DASHBOARD_CHANNEL, null),
        }),
      )
      .then((result) => {
        lastError = null;
        bb.log.info(
          `synced ${repository}: ${result.pullRequests} pull requests, ${result.issues} issues and ` +
            `${result.releases} releases in ` +
            `${result.calls} calls, ${Date.now() - started} ms`,
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

  /** Adds the thread each row started, which is null for most of them. */
  function withThreads<T extends { number: number }>(rows: readonly T[], kind: ThreadKind): Array<T & { threadId: string | null }> {
    const threads = store.threadsFor(repository, kind);
    return rows.map((row) => ({ ...row, threadId: threads.get(row.number) ?? null }));
  }

  const NO_FLOWS = { started: [], finished: [], flows: [], fromEarlier: [], open: [], asked: null, median: 0, p90: 0 };

  bb.rpc.register(rpcContract, {
    people_activity: ({ range }) => {
      if (!configured) {
        return { repository: null, buckets: [], stages: [], flow: emptyFlow(), releases: { published: 0, patches: 0, minors: [], older: 0 },
          velocity: { merge: NO_FLOWS, review: NO_FLOWS },
          authors: [], people: [], sync: status() };
      }
      const { syncedAt } = store.syncState(repository);
      if (syncedAt === null || Date.now() - syncedAt > STALE_AFTER_MS) startSync();
      const now = Date.now();
      const buckets = bucketsFor(range);
      // A stage's queue is what is in it now, whatever the period, so the
      // stages read every stored pull request rather than only the period's.
      const prs = store.readActivity(repository, 0);
      const issues = store.readIssues(repository, 0);
      return {
        repository,
        buckets,
        stages: stageSummaries({ pullRequests: prs, issues }, buckets, now),
        flow: flowOf({ pullRequests: prs, issues }, buckets[0].start, buckets.at(-1)!.end),
        velocity: { merge: mergeFlows(prs, buckets, now), review: reviewFlows(prs, buckets, now) },
        releases: releaseSummaries(store.readReleases(repository), prs, repository, buckets[0].start, buckets.at(-1)!.end),
        // A pull request opened before the period can still merge inside it,
        // so authoring reads them all rather than only the recently updated.
        authors: authorActivity(prs, buckets),
        people: peopleActivity(prs.filter((pr) => Date.parse(pr.updatedAt) >= buckets[0].start), buckets),
        sync: status(),
      };
    },
    person_activity: ({ login, range, authoredPage }) => {
      const noPaging = { page: 0, pages: 1, from: 0, to: 0, total: 0 };
      if (!configured) {
        return {
          repository: null,
          login,
          buckets: [],
          authorFlows: NO_FLOWS,
          activity: null,
          awaiting: [],
          authored: [],
          authoredPaging: noPaging,
          sync: status(),
        };
      }
      const { syncedAt } = store.syncState(repository);
      if (syncedAt === null || Date.now() - syncedAt > STALE_AFTER_MS) startSync();
      const now = Date.now();
      const buckets = bucketsFor(range);
      const prs = store.readActivity(repository, buckets[0].start);
      const authored = authoredPullRequests(prs, login, buckets[0].start, now);
      // Every stored pull request, as PR velocity reads them, so one opened
      // before the period still counts where it merged or stayed open.
      const everything = store.readActivity(repository, 0);
      const paging = pageOf(authored.length, authoredPage, AUTHORED_PAGE_SIZE);
      return {
        repository,
        login,
        buckets,
        authorFlows: mergeFlows(everything.filter((pr) => pr.author?.login === login), buckets, now),
        activity: peopleActivity(prs, buckets).find((person) => person.login === login) ?? null,
        // Open pull requests are waiting now, whatever the period, so this
        // reads every stored one rather than only the period's.
        awaiting: withThreads(awaitingReview(everything, login, now), "pull"),
        authored: withThreads(authored.slice(paging.offset, paging.to), "pull"),
        authoredPaging: { page: paging.page, pages: paging.pages, from: paging.from, to: paging.to, total: authored.length },
        sync: status(),
      };
    },
    older_releases: ({ before, count }) => {
      if (!configured) return { minors: [], more: false };
      return olderReleases(store.readReleases(repository), store.readActivity(repository, 0), repository, before, count);
    },
    stage_detail: ({ stage, range, waitingPage }) => {
      const now = Date.now();
      const buckets = configured ? bucketsFor(range) : [];
      const detail = stageDetail(
        stage,
        configured
          ? { pullRequests: store.readActivity(repository, 0), issues: store.readIssues(repository, 0) }
          : { pullRequests: [], issues: [] },
        buckets,
        now,
      );
      const paging = pageOf(detail.waitingNow.length, waitingPage);
      const kind: ThreadKind = stage === "triage" || stage === "ownership" ? "issue" : "pull";
      if (configured) {
        const { syncedAt } = store.syncState(repository);
        if (syncedAt === null || Date.now() - syncedAt > STALE_AFTER_MS) startSync();
      }
      return {
        repository: configured ? repository : null,
        buckets,
        stage: {
          ...detail,
          waitingNow: withThreads(detail.waitingNow.slice(paging.offset, paging.offset + PAGE_SIZE), kind),
        },
        waitingPaging: {
          page: paging.page,
          pages: paging.pages,
          from: paging.from,
          to: paging.to,
          total: detail.waitingNow.length,
        },
        sync: status(),
      };
    },
    /**
     * The composer built the request; this forwards it unchanged and adds the
     * title, then remembers the thread so the row can offer to open it.
     */
    start_thread: async ({ kind, number, title, request }) => {
      const thread = await bb.sdk.threads.spawn({
        // The composer validated this; `threads.spawn` validates it again.
        ...(request as unknown as Parameters<typeof bb.sdk.threads.spawn>[0]),
        title,
      });
      store.linkThread(repository, kind, number, thread.id);
      bb.log.info(`started ${thread.id} for ${kind} #${number} in ${repository}`);
      bb.realtime.publish(DASHBOARD_CHANNEL, { startedAt: Date.now() });
      return { threadId: thread.id };
    },
    open_items: ({ kind, page }) => {
      if (!configured) {
        return { repository: null, kind, rows: [], paging: { page: 0, pages: 1, from: 0, to: 0, total: 0 }, sync: status() };
      }
      const { syncedAt } = store.syncState(repository);
      if (syncedAt === null || Date.now() - syncedAt > STALE_AFTER_MS) startSync();
      const rows = openItems(kind === "issue" ? store.readIssues(repository, 0) : store.readActivity(repository, 0));
      const paging = pageOf(rows.length, page);
      return {
        repository,
        kind,
        rows: withThreads(rows.slice(paging.offset, paging.to), kind),
        paging: { page: paging.page, pages: paging.pages, from: paging.from, to: paging.to, total: rows.length },
        sync: status(),
      };
    },
    /**
     * Read on each open rather than cached, so a project added or removed
     * since the plugin started is seen. One project list per page open.
     */
    repository_project: async () => {
      if (!configured) return { projectId: null };
      try {
        return { projectId: matchProjectForRepo(repository, await toProjectCandidates(await bb.sdk.projects.list())) };
      } catch (error) {
        bb.log.warn(`could not match a project to ${repository}: ${messageOf(error)}`);
        return { projectId: null };
      }
    },
    /** Just the sync line, for the panel header, which mounts on its own. */
    sync_status: () => status(),
    sync_now: () => {
      startSync();
      return status();
    },
  });
}
