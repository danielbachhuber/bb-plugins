import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createGhRunner, readGitRemoteUrls } from "@danielb/gh-shared/gh";
import { createHarvestBridge } from "bb-plugin-harvest/bridge";
import {
  rpcContract,
  type ContextChanges,
  type ContextIssue,
  type ContextPullRequest,
  type ThreadContext,
} from "./context/contract.js";
import { createGh, type Gh } from "./context/gh.js";
import {
  githubRepoFromRemote,
  openingLineIssueNumber,
  promptIssue,
  promptPullRequest,
  pullRequestIssueRefs,
  type IssueRef,
} from "./context/rules.js";
import { MIGRATIONS, createStore, type DatabaseLike } from "./context/store.js";

export { rpcContract };

/** Payload `{ threadId }`, or `{ threadId: null }` when every banner should look again. */
export const REALTIME_CHANNEL = "context-changed";

/** How many unscanned threads the background pass reads each time it runs. */
const SCAN_BATCH = 50;
const SCAN_INTERVAL_MS = 5 * 60_000;

interface ThreadLike {
  id: string;
  environmentId?: string | null;
  archivedAt?: number | null;
}

interface EnvironmentLike {
  id: string;
  path?: string | null;
  defaultBranch?: string | null;
  mergeBaseBranch?: string | null;
}

/** `owner/name` and number from a GitHub pull request or issue URL. */
function refFromUrl(url: string): IssueRef | null {
  const match = url.match(/github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/(?:pull|issues)\/(\d+)/);
  return match ? { repo: match[1]!.toLowerCase(), number: Number(match[2]) } : null;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    ghPath: {
      type: "string",
      label: "Path to the gh CLI",
      default: "gh",
    },
    hideDefaultBanner: {
      type: "select",
      label: "Hide bb's own banner",
      // On: bb's prompt context banner is hidden wherever this plugin's is
      // drawn. Off shows both, which is how to compare them in the app.
      options: ["on", "off"],
      default: "on",
    },
  });

  const db = bb.storage.database();
  bb.storage.migrate(db, MIGRATIONS);
  const store = createStore(db as unknown as DatabaseLike);
  const harvest = createHarvestBridge(bb);

  // Rebuilt when the gh path setting changes, so its cache does not outlive it.
  let gh: { path: string; client: Gh } | null = null;
  async function ghClient(): Promise<Gh> {
    const { ghPath } = await settings.get();
    if (gh?.path !== ghPath) gh = { path: ghPath, client: createGh(createGhRunner(ghPath)) };
    return gh.client;
  }

  function publish(threadId: string | null) {
    bb.realtime.publish(REALTIME_CHANNEL, { threadId });
  }

  async function environmentFor(thread: ThreadLike): Promise<EnvironmentLike | null> {
    if (!thread.environmentId) return null;
    try {
      return (await bb.sdk.environments.get({
        environmentId: thread.environmentId,
      })) as unknown as EnvironmentLike;
    } catch {
      return null;
    }
  }

  /**
   * The text of a thread's first prompt, or null when it has not been sent yet.
   *
   * Read from the event log rather than `titleFallback`, which is the same text
   * cut to a sidebar's width: a URL after a sentence of context would be lost.
   */
  async function firstPromptText(threadId: string): Promise<string | null> {
    const events = await bb.sdk.threads.events.list({
      threadId,
      types: ["client/turn/requested"],
      order: "asc",
      limit: "1",
    });
    if (events.length === 0) return null;
    const input = (events[0]?.data as { input?: Array<{ type?: string; text?: string }> } | undefined)
      ?.input;
    if (!Array.isArray(input)) return "";
    return input
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }

  /**
   * Rule 2 names a number and not a repository. The checkout's GitHub remotes
   * say which repositories it could be; a fork has two, so each is asked in
   * turn and the first that has the issue wins.
   */
  async function repoForIssueNumber(
    environment: EnvironmentLike | null,
    number: number,
  ): Promise<string | null> {
    if (!environment?.path) return null;
    const repos = [
      ...new Set(
        (await readGitRemoteUrls(environment.path))
          .map(githubRepoFromRemote)
          .filter((repo): repo is string => repo !== null),
      ),
    ];
    if (repos.length <= 1) return repos[0] ?? null;
    const client = await ghClient();
    for (const repo of repos) {
      if (await client.issue({ repo, number })) return repo;
    }
    return null;
  }

  /**
   * Rules 1 and 2, and the pull request a prompt names, once per thread. A
   * thread with no prompt yet is left for later.
   */
  async function scanThread(
    thread: ThreadLike,
    environment?: EnvironmentLike | null,
  ): Promise<boolean> {
    if (store.isScanned(thread.id)) return false;
    const text = await firstPromptText(thread.id);
    if (text === null) return false;
    const before = store.itemsForThread(thread.id).length;

    const now = Date.now();
    const pull = promptPullRequest(text);
    if (pull) {
      store.link({ threadId: thread.id, kind: "pull", ...pull, source: "prompt", createdAt: now });
    }
    const fromPrompt = promptIssue(text);
    if (fromPrompt) {
      store.link({ threadId: thread.id, kind: "issue", ...fromPrompt, source: "prompt", createdAt: now });
    } else {
      const number = openingLineIssueNumber(text);
      if (number !== null) {
        const repo = await repoForIssueNumber(environment ?? (await environmentFor(thread)), number);
        if (repo) {
          store.link({ threadId: thread.id, kind: "issue", repo, number, source: "opening-line", createdAt: now });
        }
      }
    }
    store.markScanned(thread.id, now);
    return store.itemsForThread(thread.id).length > before;
  }

  async function pullRequestFor(
    thread: ThreadLike,
    environment: EnvironmentLike | null,
  ): Promise<{ pullRequest: ContextPullRequest; baseRefName: string | null } | null> {
    if (environment) {
      try {
        const result = await bb.sdk.environments.pullRequest({ environmentId: environment.id });
        if (result.outcome === "available") {
          const pr = result.pullRequest;
          const ref = refFromUrl(pr.url);
          if (ref) {
            return {
              baseRefName: pr.baseRefName,
              pullRequest: {
                repo: ref.repo,
                number: pr.number,
                title: pr.title,
                url: pr.url,
                state: pr.state,
                attention: pr.attention,
                checks: pr.checks,
                // What bb itself offers merge on. A conflicting or blocked pull
                // request would only fail, so it gets no button.
                canMerge: pr.mergeability.state === "mergeable",
              },
            };
          }
        }
      } catch (error) {
        bb.log.warn(`pull request lookup failed for ${thread.id}: ${String(error)}`);
      }
    }

    // A thread a sweep linked to a pull request it is not checked out on:
    // review threads, above all.
    const linked = store.itemsForThread(thread.id).find((link) => link.kind === "pull");
    if (!linked) return null;
    const fetched = await (await ghClient()).pullRequest(linked);
    const url = fetched?.url ?? `https://github.com/${linked.repo}/pull/${linked.number}`;
    const state = fetched?.state ?? "open";
    return {
      baseRefName: null,
      pullRequest: {
        repo: linked.repo,
        number: linked.number,
        title: fetched?.title ?? `#${linked.number}`,
        url,
        state,
        attention: state === "open" ? "none" : state,
        checks: null,
        canMerge: false,
      },
    };
  }

  async function changesFor(
    environment: EnvironmentLike,
    baseRefName: string | null,
  ): Promise<ContextChanges | null> {
    const mergeBaseBranch =
      environment.mergeBaseBranch ?? baseRefName ?? environment.defaultBranch ?? undefined;
    try {
      const result = await bb.sdk.environments.status({
        environmentId: environment.id,
        ...(mergeBaseBranch ? { mergeBaseBranch } : {}),
      });
      if (result.outcome !== "available") return null;
      const { workingTree, mergeBase } = result.workspace;
      // Uncommitted work first, as bb's own banner does: it is what a commit
      // or the next turn will change.
      if (workingTree.files.length > 0) {
        return {
          // bb's own wording: only a tree of nothing but new files is "Untracked".
          label: workingTree.state === "untracked" ? "Untracked" : "Uncommitted",
          files: workingTree.files.length,
          insertions: workingTree.insertions,
          deletions: workingTree.deletions,
        };
      }
      if (mergeBase?.hasCommittedUnmergedChanges) {
        return {
          label: "Committed",
          files: mergeBase.files.length,
          insertions: mergeBase.insertions,
          deletions: mergeBase.deletions,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async function issuesFor(threadId: string, pullRequest: ContextPullRequest | null) {
    const client = await ghClient();
    if (pullRequest) {
      const fetched = await client.pullRequest(pullRequest);
      // Only on an answer: a failed lookup must not wipe what an earlier one found.
      if (fetched) {
        store.replaceViaPr(
          threadId,
          pullRequestIssueRefs({ repo: pullRequest.repo, body: fetched.body, closing: fetched.closing }),
          Date.now(),
        );
      }
    }

    const seen = new Set<string>();
    const issues: ContextIssue[] = [];
    for (const link of store.itemsForThread(threadId)) {
      if (link.kind !== "issue") continue;
      const key = `${link.repo}#${link.number}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fetched = await client.issue(link);
      issues.push({
        repo: link.repo,
        number: link.number,
        url: `https://github.com/${link.repo}/issues/${link.number}`,
        title: fetched?.title ?? null,
        state: fetched?.state ?? null,
        source: link.source,
        viaPullRequest: link.source === "via-pr" ? (pullRequest?.number ?? null) : null,
      });
    }
    return issues;
  }

  async function harvestState(): Promise<ThreadContext["harvest"]> {
    if (!(await harvest.available())) return { available: false, running: null };
    return { available: true, running: await harvest.runningReference() };
  }

  async function threadContext(threadId: string): Promise<ThreadContext> {
    const { hideDefaultBanner } = await settings.get();
    const hide = hideDefaultBanner === "on";
    const thread = (await bb.sdk.threads.get({ threadId })) as unknown as ThreadLike;

    if (thread.archivedAt) {
      return {
        archived: true,
        hide,
        pullRequest: null,
        issues: [],
        changes: null,
        harvest: { available: false, running: null },
      };
    }

    const environment = await environmentFor(thread);
    await scanThread(thread, environment);
    const found = await pullRequestFor(thread, environment);
    const pullRequest = found?.pullRequest ?? null;
    const [issues, changes, harvestNow] = await Promise.all([
      issuesFor(threadId, pullRequest),
      environment ? changesFor(environment, found?.baseRefName ?? null) : Promise.resolve(null),
      harvestState(),
    ]);
    return { archived: false, hide, pullRequest, issues, changes, harvest: harvestNow };
  }

  async function environmentIdFor(threadId: string): Promise<string> {
    const thread = (await bb.sdk.threads.get({ threadId })) as unknown as ThreadLike;
    if (!thread.environmentId) throw new Error("This thread has no environment to act on.");
    return thread.environmentId;
  }

  bb.rpc.register(rpcContract, {
    threadContext({ threadId }) {
      return threadContext(threadId);
    },

    async mergePullRequest({ threadId, method }) {
      await bb.sdk.environments.mergePullRequest({
        environmentId: await environmentIdFor(threadId),
        method,
      });
      publish(threadId);
      return null;
    },

    async markPullRequestReady({ threadId }) {
      await bb.sdk.environments.markPullRequestReady({
        environmentId: await environmentIdFor(threadId),
      });
      publish(threadId);
      return null;
    },

    async unarchiveThread({ threadId }) {
      await bb.sdk.threads.unarchive({ threadId });
      publish(threadId);
      return null;
    },

    linkThread({ threadId, repo, kind, number, source }) {
      store.link({ threadId, repo, kind, number, source, createdAt: Date.now() });
      publish(threadId);
      return null;
    },

    unlinkThread({ threadId, source }) {
      store.unlink(threadId, source);
      publish(threadId);
      return null;
    },

    threadsForItems({ items }) {
      return store.threadsForItems(items);
    },

    itemsForThread({ threadId }) {
      return store
        .itemsForThread(threadId)
        .map(({ repo, kind, number, source }) => ({ repo, kind, number, source }));
    },

    harvestAssignments() {
      return harvest.assignments();
    },

    harvestTrackedHours({ externalId, groupId }) {
      return harvest.trackedHours({ externalId, groupId });
    },

    harvestLastSelection({ scope }) {
      return harvest.lastSelection({ scope });
    },

    async harvestStartTimer(input) {
      const result = await harvest.startTimer(input);
      publish(null);
      return result;
    },

    async harvestStopTimer(input) {
      await harvest.stopTimer(input);
      publish(null);
      return null;
    },
  });

  // A turn ending is when commits land and pull requests open, and bb has no
  // event for either, so that is when every banner on the thread looks again.
  for (const event of ["thread.idle", "thread.failed", "thread.archived"] as const) {
    bb.events.on(event, ({ thread }) => publish(thread.id));
  }
  bb.events.on("thread.deleted", ({ thread }) => {
    store.deleteThread(thread.id);
    publish(thread.id);
  });

  /**
   * Pages threads.list, which caps a page however large a limit is asked for.
   * Whole threads, not ids: rule 2 needs the environment to find a repository.
   */
  async function everyThread(): Promise<ThreadLike[]> {
    const threads: ThreadLike[] = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const page = await bb.sdk.threads.list({ archived: false, limit: pageSize, offset });
      threads.push(...(page as unknown as ThreadLike[]));
      if (page.length < pageSize) break;
    }
    return threads;
  }

  // Links for threads nobody has opened yet, so a sweep's panel knows about a
  // thread started by hand before its banner has ever been drawn.
  bb.background.service("scan", {
    async start(signal) {
      while (!signal.aborted) {
        try {
          const threads = await everyThread();
          const unscanned = new Set(store.unscanned(threads.map((thread) => thread.id)));
          const pending = threads.filter((thread) => unscanned.has(thread.id)).slice(0, SCAN_BATCH);
          let linked = false;
          for (const thread of pending) {
            if (signal.aborted) return;
            // One thread whose events cannot be read must not stall the rest.
            try {
              if (await scanThread(thread)) linked = true;
            } catch (error) {
              bb.log.warn(`could not scan ${thread.id}: ${String(error)}`);
            }
          }
          if (linked) publish(null);
        } catch (error) {
          bb.log.warn(`scan failed: ${String(error)}`);
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, SCAN_INTERVAL_MS);
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
