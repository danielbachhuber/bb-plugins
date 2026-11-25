import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createGhRunner, createSyncUsage, GhUnavailableError } from "@danielb/gh-shared/gh";
import { loadedRepoSlugs, matchProjectForRepo, parseRepositorySlugs, toProjectCandidates } from "@danielb/gh-shared/projects";

import { rpcContract } from "./milestones/contract.js";
import { fetchMilestones, RepositoryNotFoundError } from "./milestones/github.js";
import { createStore, MIGRATIONS, type RepositoryState } from "./milestones/store.js";
import { byDue, detail, periodWords, summarize, weekBuckets } from "./milestones/summary.js";

export { rpcContract };

const REALTIME_CHANNEL = "milestones-updated";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    syncIntervalMinutes: {
      type: "select",
      label: "Sync interval (minutes)",
      // Each sync costs about 14 points of GitHub's 5,000-an-hour budget per
      // hundred issues in open milestones, so the default is slow.
      options: ["15", "30", "60"],
      default: "30",
    },
    periodWeeks: {
      type: "select",
      label: "Period (weeks)",
      // How far back "added" and "closed" count, and the shaded part of a
      // milestone's history.
      options: ["2", "4", "6", "8", "12"],
      default: "6",
    },
    extraRepositories: {
      type: "string",
      label: "Also list these repositories",
      // Comma or newline separated owner/name, for a repository without a
      // checkout here.
      default: "",
    },
    ghPath: {
      type: "string",
      label: "Path to the gh CLI",
      default: "gh",
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db as never);
  const syncUsage = createSyncUsage();
  const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

  // A row whose thread has been archived or deleted offers to start a new one
  // rather than opening a thread that is gone.
  for (const event of ["thread.archived", "thread.deleted"] as const) {
    bb.events.on(event, ({ thread }) => {
      if (store.releaseThread(thread.id) > 0) bb.realtime.publish(REALTIME_CHANNEL, { releasedAt: Date.now() });
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
        bb.realtime.publish(REALTIME_CHANNEL, { releasedAt: Date.now() });
      }
    } catch (error) {
      bb.log.warn(`could not check thread links: ${messageOf(error)}`);
    }
  })();

  /**
   * Every repository a bb project here has as a remote, plus the extra ones,
   * read again on each sync so a project added since is picked up.
   */
  async function repositories(): Promise<string[]> {
    const { extraRepositories } = await settings.get();
    const slugs = loadedRepoSlugs(await toProjectCandidates(await bb.sdk.projects.list()));
    for (const extra of parseRepositorySlugs(extraRepositories)) slugs.add(extra);
    return [...slugs].sort();
  }

  /** One sync at a time; a second caller waits on the one running. */
  let running: Promise<{ ok: boolean; error: string | null }> | null = null;

  function syncNow(signal?: AbortSignal): Promise<{ ok: boolean; error: string | null }> {
    running ??= sync(signal).finally(() => {
      running = null;
    });
    return running;
  }

  async function sync(signal?: AbortSignal): Promise<{ ok: boolean; error: string | null }> {
    const { ghPath } = await settings.get();
    try {
      const repos = await repositories();
      const states: RepositoryState[] = [];
      await syncUsage.measure(createGhRunner(ghPath, signal), async (gh) => {
        for (const repo of repos) {
          signal?.throwIfAborted();
          try {
            const milestones = await fetchMilestones(gh, repo);
            store.replaceRepo(repo, milestones);
            // GitHub's spelling, where it has milestones to say it.
            states.push({ repo: milestones[0]?.repo ?? repo, error: null });
          } catch (error) {
            if (error instanceof GhUnavailableError || signal?.aborted) throw error;
            // A remote GitHub cannot find, such as a deleted fork, is not a
            // repository to list.
            if (error instanceof RepositoryNotFoundError) {
              bb.log.info(`skipped ${repo}: ${error.message}`);
              continue;
            }
            // One repository that cannot be read keeps its last milestones.
            const message = messageOf(error);
            bb.log.warn(`could not read milestones for ${repo}: ${message}`);
            states.push({ repo, error: message });
          }
        }
      });
      store.finishSync(states, Date.now(), null);
      bb.realtime.publish(REALTIME_CHANNEL, { syncedAt: Date.now() });
      return { ok: true, error: null };
    } catch (error) {
      if (signal?.aborted) return { ok: false, error: "Sync stopped." };
      const message = error instanceof Error ? error.message : String(error);
      bb.log.warn(`milestone sync failed: ${message}`);
      store.recordFailure(message);
      bb.realtime.publish(REALTIME_CHANNEL, { syncedAt: null });
      return { ok: false, error: message };
    }
  }

  async function period(now: number) {
    const weeks = Number((await settings.get()).periodWeeks) || 6;
    return { buckets: weekBuckets(now, weeks), label: periodWords(weeks) };
  }

  bb.rpc.register(rpcContract, {
    async list() {
      const now = Date.now();
      const { buckets, label } = await period(now);
      const meta = store.readMeta();
      const all = store.readAll();
      return {
        periodLabel: label,
        syncedAt: meta.syncedAt,
        usage: syncUsage.snapshot(),
        lastError: meta.lastError,
        repositories: store.readRepositories().map((repository) => ({
          repo: repository.repo,
          error: repository.error,
          milestones: all
            .filter((milestone) => milestone.repo.toLowerCase() === repository.repo.toLowerCase())
            .map((milestone) => summarize(milestone, buckets))
            .sort(byDue),
        })),
      };
    },

    async milestone({ repo, number }) {
      const now = Date.now();
      const { buckets, label } = await period(now);
      const found = store.readOne(repo, number);
      const lastError = store.readMeta().lastError;
      const periodStart = buckets[0]?.start ?? now;
      if (found === null) {
        return {
          periodLabel: label,
          periodStart,
          repo,
          milestone: null,
          open: [],
          closed: [],
          history: { at: [], total: [], closed: [] },
          lastError,
        };
      }
      const { open, closed, history } = detail(found, now);
      const threads = store.threadsFor(found.repo);
      const withThread = <T extends { number: number }>(issue: T) => ({ ...issue, threadId: threads.get(issue.number) ?? null });
      return {
        periodLabel: label,
        periodStart,
        repo: found.repo,
        milestone: summarize(found, buckets),
        open: open.map(withThread),
        closed: closed.map(withThread),
        history,
        lastError,
      };
    },

    async repository_project({ repo }) {
      try {
        return { projectId: matchProjectForRepo(repo, await toProjectCandidates(await bb.sdk.projects.list())) };
      } catch (error) {
        bb.log.warn(`could not match a project to ${repo}: ${messageOf(error)}`);
        return { projectId: null };
      }
    },

    async start_thread({ repo, number, title, request }) {
      const thread = await bb.sdk.threads.spawn({
        // The composer validated this; `threads.spawn` validates it again.
        ...(request as unknown as Parameters<typeof bb.sdk.threads.spawn>[0]),
        title,
      });
      store.linkThread(repo, number, thread.id);
      bb.log.info(`started ${thread.id} for issue #${number} in ${repo}`);
      bb.realtime.publish(REALTIME_CHANNEL, { threadId: thread.id });
      return { threadId: thread.id };
    },

    refresh() {
      return syncNow();
    },
  });

  bb.background.service("sync", {
    async start(signal) {
      while (!signal.aborted) {
        await syncNow(signal);
        if (signal.aborted) return;
        const delay = Number((await settings.get()).syncIntervalMinutes) * 60_000;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    },
  });
}
