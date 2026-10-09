// bb-plugin-diff-viewed — backend entry.
//
// Two jobs: persist which files in a thread's diff have been marked viewed, so
// the mark survives a reload and follows the thread across app windows, and
// keep those marks in step with GitHub's Viewed boxes when the thread has a
// pull request. The logic — keying, fingerprinting, pruning, which side a mark
// lives on — is pure functions in viewed/marks.ts and viewed/github.ts; this
// file is the storage boundary and the wire contract, and viewed/pull-request.ts
// is every GitHub call.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { createGhRunner, type GhRunner } from "@danielb/gh-shared/gh";
import { z } from "zod";
import {
  githubPath,
  pendingKey,
  pendingPushes,
  syncMode,
  withGithubViewed,
  withPending,
  type GithubState,
} from "./viewed/github";
import { prune, recordKey, withMark, type ViewedRecord } from "./viewed/marks";
import { fetchPullRequest, setFileViewed, type FetchedPullRequest } from "./viewed/pull-request";

const recordSchema = z.record(z.string(), z.string());

const githubSchema = z
  .object({
    number: z.number(),
    url: z.string(),
    files: z.array(
      z.object({
        path: z.string(),
        additions: z.number(),
        deletions: z.number(),
        viewed: z.boolean(),
      }),
    ),
  })
  .nullable();

/** A thread's marks, and its pull request's files when sync is on. */
const marksSchema = z.object({ record: recordSchema, github: githubSchema });

const threadIdSchema = z.string().trim().min(1).max(200);
// A rename card's label is `previous -> current`, so paths are not bounded by
// a single path length. 2000 is generous and still keeps a hostile client from
// filling kv storage with one key.
const pathSchema = z.string().trim().min(1).max(2000);

export const rpcContract = defineRpcContract({
  /** The thread's marks alone, from storage, without waiting on GitHub. */
  viewed_marks: {
    input: z.object({ threadId: threadIdSchema }).strict(),
    output: z.object({ record: recordSchema }),
  },
  viewed_list: {
    input: z.object({ threadId: threadIdSchema }).strict(),
    output: marksSchema,
  },
  viewed_set: {
    input: z
      .object({
        threadId: threadIdSchema,
        path: pathSchema,
        fingerprint: z.string().trim().min(1).max(200),
        viewed: z.boolean(),
      })
      .strict(),
    output: marksSchema,
  },
  viewed_prune: {
    input: z
      .object({
        threadId: threadIdSchema,
        presentPaths: z.array(pathSchema).max(5000),
      })
      .strict(),
    output: z.object({ record: recordSchema }),
  },
  filter_get: {
    input: z.null(),
    output: z.object({ onlyUnviewed: z.boolean() }),
  },
  filter_set: {
    input: z.object({ onlyUnviewed: z.boolean() }).strict(),
    output: z.object({ onlyUnviewed: z.boolean() }),
  },
  problem_report: {
    input: z.object({ message: z.string().trim().min(1).max(1000) }).strict(),
    output: z.object({ ok: z.literal(true) }),
  },
});

/**
 * Whether the changes panel hides files marked viewed. One setting for every
 * thread, since it describes how you like to read a diff rather than anything
 * about one diff.
 */
const FILTER_KEY = "filter:only-unviewed";

/**
 * Realtime channel the content script listens on. The payload carries the
 * thread id so a window showing a different thread can ignore it without a
 * refetch.
 */
export const VIEWED_CHANGED = "viewed-changed";

/**
 * How long a pull request's files are reused before GitHub is asked again.
 * The panel asks on every thread open and window focus; this caps that at one
 * query a thread per half minute.
 */
const GITHUB_TTL_MS = 30_000;

interface GithubEntry {
  value: FetchedPullRequest | null;
  fetchedAt: number;
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  const settings = bb.settings.define({
    syncGithub: {
      type: "select",
      label: "Sync with GitHub",
      // On: a thread with a pull request shares its Viewed marks with
      // GitHub's own Viewed boxes, for files whose diff matches GitHub's.
      options: ["on", "off"],
      default: "on",
    },
    ghPath: {
      type: "string",
      label: "Path to the gh CLI",
      default: "gh",
    },
  });

  let runner: { path: string; gh: GhRunner } | null = null;
  function ghFor(path: string): GhRunner {
    if (runner?.path !== path) runner = { path, gh: createGhRunner(path) };
    return runner.gh;
  }

  const githubCache = new Map<string, GithubEntry>();
  const inFlight = new Map<string, Promise<FetchedPullRequest | null>>();
  // Failures already logged, so a missing gh is one log line, not one a pass.
  const logged = new Set<string>();
  function warnOnce(message: string): void {
    if (logged.has(message)) return;
    logged.add(message);
    bb.log.warn(message);
  }

  /** The URL of the thread's open pull request, or null. */
  async function pullRequestUrl(threadId: string): Promise<string | null> {
    const thread = await bb.sdk.threads.get({ threadId });
    const environmentId = (thread as { environmentId?: string | null }).environmentId;
    if (!environmentId) return null;
    const result = await bb.sdk.environments.pullRequest({ environmentId });
    if (result.outcome !== "available") return null;
    return result.pullRequest.state === "open" ? result.pullRequest.url : null;
  }

  async function loadGithub(threadId: string): Promise<FetchedPullRequest | null> {
    const { syncGithub, ghPath } = await settings.get();
    if (syncGithub !== "on") return null;
    try {
      const url = await pullRequestUrl(threadId);
      return url === null ? null : await fetchPullRequest(ghFor(ghPath), url);
    } catch (error) {
      warnOnce(`GitHub sync unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** The thread's pull request files, cached, with one request in flight. */
  async function github(threadId: string): Promise<FetchedPullRequest | null> {
    const cached = githubCache.get(threadId);
    if (cached && Date.now() - cached.fetchedAt < GITHUB_TTL_MS) return cached.value;
    const running = inFlight.get(threadId);
    if (running) return running;
    const request = loadGithub(threadId)
      .then((value) => {
        githubCache.set(threadId, { value, fetchedAt: Date.now() });
        return value;
      })
      .finally(() => inFlight.delete(threadId));
    inFlight.set(threadId, request);
    return request;
  }

  /** What the content script sees: everything but the node id. */
  function wire(value: FetchedPullRequest | null): GithubState | null {
    if (value === null) return null;
    return { number: value.number, url: value.url, files: value.files };
  }

  async function read(threadId: string): Promise<ViewedRecord> {
    return (await bb.storage.kv.get<ViewedRecord>(recordKey(threadId))) ?? {};
  }

  async function readPending(threadId: string): Promise<readonly string[]> {
    return (await bb.storage.kv.get<string[]>(pendingKey(threadId))) ?? [];
  }

  async function writePending(
    threadId: string,
    before: readonly string[],
    after: readonly string[],
  ): Promise<void> {
    if (after !== before) await bb.storage.kv.set(pendingKey(threadId), after);
  }

  /** Remember the cache's new Viewed state without resetting its age. */
  function cacheGithub(threadId: string, value: FetchedPullRequest): void {
    const cached = githubCache.get(threadId);
    githubCache.set(threadId, { value, fetchedAt: cached?.fetchedAt ?? Date.now() });
  }

  const flushing = new Map<string, Promise<FetchedPullRequest>>();

  /**
   * Send GitHub the marks made in bb before they could reach it, once their
   * diff is the pull request's: after the branch is pushed, or the pull
   * request opened. A mark that fails to send stays waiting for the next try.
   * Overlapping calls share one run, so a focus burst sends each mark once.
   */
  function flushPending(
    threadId: string,
    record: ViewedRecord,
    pull: FetchedPullRequest,
  ): Promise<FetchedPullRequest> {
    const running = flushing.get(threadId);
    if (running) return running;
    const run = (async () => {
      const before = await readPending(threadId);
      if (before.length === 0) return pull;
      const { push, remaining } = pendingPushes(record, before, pull);
      const { ghPath } = await settings.get();
      let updated = pull;
      const failed: string[] = [];
      for (const path of push) {
        try {
          await setFileViewed(ghFor(ghPath), pull.id, path, true);
          updated = { ...updated, ...withGithubViewed(updated, path, true) };
        } catch (error) {
          bb.log.warn(`Could not mark ${path} viewed on GitHub: ${String(error)}`);
          failed.push(path);
        }
      }
      const kept = before.filter(
        (path) => remaining.includes(path) || failed.includes(githubPath(path)),
      );
      await writePending(threadId, before, kept.length === before.length ? before : kept);
      if (updated !== pull) cacheGithub(threadId, updated);
      return updated;
    })().finally(() => flushing.delete(threadId));
    flushing.set(threadId, run);
    return run;
  }

  /**
   * Persist only when the pure layer actually produced a different record.
   * Identity is the signal: `withMark` and `prune` return their input when
   * nothing changed, which keeps a redundant checkbox click from writing
   * storage and waking every open window.
   */
  async function commit(
    threadId: string,
    before: ViewedRecord,
    after: ViewedRecord,
  ): Promise<ViewedRecord> {
    if (after === before) return before;
    await bb.storage.kv.set(recordKey(threadId), after);
    bb.realtime.publish(VIEWED_CHANGED, { threadId });
    return after;
  }

  bb.rpc.register(rpcContract, {
    viewed_marks: async ({ threadId }) => ({ record: await read(threadId) }),
    viewed_list: async ({ threadId }) => {
      const [record, pull] = await Promise.all([read(threadId), github(threadId)]);
      if (pull === null) return { record, github: null };
      return { record, github: wire(await flushPending(threadId, record, pull)) };
    },
    viewed_set: async ({ threadId, path, fingerprint, viewed }) => {
      const before = await read(threadId);
      const after = withMark(before, { path, fingerprint }, viewed);
      const record = await commit(threadId, before, after);

      // The local mark is kept either way, so the file stays marked if the
      // diff later stops matching GitHub's. It reaches GitHub only when the
      // diff being marked is the one GitHub has; until then it waits in the
      // pending list, and viewed_list sends it once the diffs match.
      const pull = await github(threadId);
      const synced = pull !== null && syncMode(pull, { path, fingerprint }).kind === "synced";
      const { syncGithub } = await settings.get();
      if (syncGithub === "on") {
        const pending = await readPending(threadId);
        await writePending(threadId, pending, withPending(pending, path, viewed && !synced));
      }
      if (!synced) return { record, github: wire(pull) };
      const { ghPath } = await settings.get();
      const remotePath = githubPath(path);
      try {
        await setFileViewed(ghFor(ghPath), pull.id, remotePath, viewed);
      } catch (error) {
        bb.log.warn(`Could not mark ${remotePath} ${viewed ? "viewed" : "unviewed"} on GitHub: ${String(error)}`);
        throw error;
      }
      const updated = { ...pull, ...withGithubViewed(pull, remotePath, viewed) };
      cacheGithub(threadId, updated);
      return { record, github: wire(updated) };
    },
    viewed_prune: async ({ threadId, presentPaths }) => {
      const before = await read(threadId);
      const after = prune(before, presentPaths);
      const pending = await readPending(threadId);
      const present = new Set(presentPaths);
      const keptPending = pending.filter((path) => present.has(path));
      await writePending(threadId, pending, keptPending.length === pending.length ? pending : keptPending);
      return { record: await commit(threadId, before, after) };
    },
    filter_get: async () => ({
      onlyUnviewed: (await bb.storage.kv.get<boolean>(FILTER_KEY)) === true,
    }),
    filter_set: async ({ onlyUnviewed }) => {
      await bb.storage.kv.set(FILTER_KEY, onlyUnviewed);
      return { onlyUnviewed };
    },
    // The content script calls this when it cannot read bb's DOM the way it
    // expects, so a bb update that breaks the plugin shows up in
    // `bb plugin logs diff-viewed` and not only in a devtools console.
    problem_report: async ({ message }) => {
      bb.log.warn(message);
      return { ok: true as const };
    },
  });

  bb.onDispose(() => {
    bb.log.info("disposed");
  });
}
