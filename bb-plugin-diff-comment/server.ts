// bb-plugin-diff-comment — backend.
//
// Three surfaces over one store: the diff overlay and panel (over RPC), the
// `bb diff-comment` CLI an agent works the queue with, and the skill in
// skills/diff-comments/SKILL.md that tells the agent how. Every write
// publishes a realtime signal so open windows refetch.
//
// It also reads the thread's pull request review threads through `gh`, for the
// overlay to draw beside the local comments. Those are never stored here.
//
// Comments are keyed by thread because a changes-panel diff belongs to a
// thread. The CLI reads the thread from its invocation context, so an agent
// never has to name it.
import { randomUUID } from "node:crypto";
import { createGhRunner, GhUnavailableError, type GhRunner } from "@danielb/gh-shared/gh";
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { COMMENTS_CHANGED, rpcShape } from "./comment/contract";
import { formatDetail, formatRow, parseRef, resolveRef } from "./comment/format";
import {
  addComment,
  applyReply,
  nextOpen,
  ordered,
  setState,
  summarize,
} from "./comment/store";
import type { Comment, CommentState } from "./comment/types";
import type { Anchored } from "./comment/anchor";
import { addDraftComment, fetchFiles, fetchReview, pullRequestRef } from "./github/fetch";
import { exchangeBody, reviewTarget, type PullFile } from "./github/patch";
import { githubPath, type GithubReview } from "./github/threads";

export const rpcContract = defineRpcContract(rpcShape);

/** kv keys are namespaced per thread; nothing reads across threads. */
function keyFor(threadId: string): string {
  return `comments:${threadId}`;
}

/**
 * How long a pull request's review threads are reused before GitHub is asked
 * again. The overlay asks on every thread open and window focus; this caps
 * that at one query a thread per half minute.
 */
const GITHUB_TTL_MS = 30_000;

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

  const settings = bb.settings.define({
    showGithub: {
      type: "select",
      label: "Show GitHub review comments",
      // On: a thread with an open pull request shows the pull request's
      // unresolved review threads on the lines they were left on.
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

  /**
   * A per-thread cache of one GitHub read, reused for `GITHUB_TTL_MS`, with
   * concurrent callers sharing one request.
   */
  function cachedPerThread<T>(load: (threadId: string) => Promise<T>) {
    const cache = new Map<string, { value: T; fetchedAt: number }>();
    const inFlight = new Map<string, Promise<T>>();
    return {
      get(threadId: string): Promise<T> {
        const cached = cache.get(threadId);
        if (cached && Date.now() - cached.fetchedAt < GITHUB_TTL_MS) return Promise.resolve(cached.value);
        const running = inFlight.get(threadId);
        if (running) return running;
        const request = load(threadId)
          .then((value) => {
            cache.set(threadId, { value, fetchedAt: Date.now() });
            return value;
          })
          .finally(() => inFlight.delete(threadId));
        inFlight.set(threadId, request);
        return request;
      },
      /** After a post, so the next read shows the new comment. */
      forget(threadId: string): void {
        cache.delete(threadId);
      },
    };
  }

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

  const reviews = cachedPerThread(async (threadId): Promise<GithubReview | null> => {
    const { showGithub, ghPath } = await settings.get();
    if (showGithub !== "on") return null;
    try {
      const url = await pullRequestUrl(threadId);
      return url === null ? null : await fetchReview(ghFor(ghPath), url);
    } catch (error) {
      warnOnce(`GitHub review comments unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });

  /**
   * What posting needs: the pull request and its patches. Read only when a
   * composer opens or an answered comment is drawn, never for the diff alone.
   */
  type Postable =
    | { state: "off" }
    | { state: "blocked"; reason: string }
    | { state: "ready"; url: string; number: number; files: PullFile[] };

  const postables = cachedPerThread(async (threadId): Promise<Postable> => {
    const { showGithub, ghPath } = await settings.get();
    if (showGithub !== "on") return { state: "off" };
    let url: string | null;
    try {
      url = await pullRequestUrl(threadId);
    } catch (error) {
      // bb could not look the pull request up, for example because the
      // thread's worktree is gone. Not a GitHub failure, so not worded as one.
      const message = error instanceof Error ? error.message : String(error);
      return { state: "blocked", reason: `Couldn't find this thread's pull request: ${message}` };
    }
    if (url === null) {
      return { state: "blocked", reason: "Open a pull request to add review comments." };
    }
    try {
      const files = await fetchFiles(ghFor(ghPath), url);
      const number = pullRequestRef(url)?.number;
      if (files === null || number === undefined) {
        return { state: "blocked", reason: "Couldn't read the pull request from GitHub." };
      }
      return { state: "ready", url, number, files };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnOnce(`GitHub posting unavailable: ${message}`);
      return {
        state: "blocked",
        reason:
          error instanceof GhUnavailableError
            ? `GitHub CLI isn't available: ${message}`
            : `Couldn't reach GitHub: ${message}`,
      };
    }
  });

  /** Where a comment would land on the pull request, or why it can't. */
  async function target(
    threadId: string,
    path: string,
    anchored: Anchored,
  ): Promise<
    | { state: "off" }
    | { state: "blocked"; reason: string }
    | { state: "ready"; url: string; number: number; line: number }
  > {
    const postable = await postables.get(threadId);
    if (postable.state !== "ready") return postable;
    const found = reviewTarget(postable.files, path, anchored);
    if (!found.ok) return { state: "blocked", reason: found.reason };
    return { state: "ready", url: postable.url, number: postable.number, line: found.line };
  }

  /** Post a draft review comment, or throw with the reason it can't go. */
  async function post(
    threadId: string,
    path: string,
    anchored: Anchored,
    body: string,
  ): Promise<string> {
    // Fresh, so a push since the composer opened is taken into account.
    postables.forget(threadId);
    const found = await target(threadId, path, anchored);
    if (found.state === "off") throw new Error("GitHub review comments are turned off.");
    if (found.state === "blocked") throw new Error(found.reason);
    const { ghPath } = await settings.get();
    const url = await addDraftComment(ghFor(ghPath), found.url, {
      path: githubPath(path),
      side: anchored.side,
      line: found.line,
      body,
    });
    reviews.forget(threadId);
    return url;
  }

  async function read(threadId: string): Promise<Comment[]> {
    return (await bb.storage.kv.get<Comment[]>(keyFor(threadId))) ?? [];
  }

  async function write(threadId: string, comments: Comment[]): Promise<void> {
    await bb.storage.kv.set(keyFor(threadId), ordered(comments));
    bb.realtime.publish(COMMENTS_CHANGED, { threadId, ...summarize(comments) });
  }

  /** Apply a change and return the comment it produced, or null if absent. */
  async function mutate(
    threadId: string,
    id: string,
    change: (comments: Comment[]) => Comment[],
  ): Promise<Comment | null> {
    const before = await read(threadId);
    if (!before.some((comment) => comment.id === id)) return null;
    const after = change(before);
    await write(threadId, after);
    return after.find((comment) => comment.id === id) ?? null;
  }

  bb.rpc.register(rpcContract, {
    comments_list: async ({ threadId }) => ({ comments: ordered(await read(threadId)) }),

    comments_add: async ({ threadId, path, side, line, anchor, body }) => {
      const comments = addComment(await read(threadId), {
        threadId,
        path,
        side,
        line,
        anchor,
        body,
        now: new Date().toISOString(),
        id: randomUUID().slice(0, 8),
      });
      await write(threadId, comments);
      return comments[comments.length - 1]!;
    },

    comments_edit: async ({ threadId, id, body }) => {
      const now = new Date().toISOString();
      const comment = await mutate(threadId, id, (comments) =>
        comments.map((candidate) =>
          candidate.id === id ? { ...candidate, body, updatedAt: now } : candidate,
        ),
      );
      if (comment === null) throw new Error(`No comment with id ${id}`);
      return comment;
    },

    comments_set_state: async ({ threadId, id, state }) => {
      const comment = await mutate(threadId, id, (comments) =>
        setState(comments, id, state, new Date().toISOString()),
      );
      if (comment === null) throw new Error(`No comment with id ${id}`);
      return comment;
    },

    comments_remove: async ({ threadId, id }) => {
      const before = await read(threadId);
      const after = before.filter((comment) => comment.id !== id);
      if (after.length === before.length) return { removed: false };
      await write(threadId, after);
      return { removed: true };
    },

    github_review: async ({ threadId }) => ({ review: await reviews.get(threadId) }),

    github_target: async ({ threadId, path, side, line, anchor }) => {
      const found = await target(threadId, path, { side, line, anchor });
      if (found.state === "ready") return { state: "ready" as const, number: found.number };
      return found;
    },

    github_post: async ({ threadId, path, side, line, anchor, body }) => ({
      url: await post(threadId, path, { side, line, anchor }, body),
    }),

    comments_post_to_github: async ({ threadId, id }) => {
      const comment = (await read(threadId)).find((candidate) => candidate.id === id);
      if (comment === undefined) throw new Error(`No comment with id ${id}`);
      if (comment.reply === null) throw new Error("Only a comment the agent has answered can be posted.");
      if (comment.github) throw new Error("This comment is already on GitHub.");
      const thread = await bb.sdk.threads.get({ threadId });
      const providerId = (thread as { providerId?: string | null }).providerId ?? null;
      const url = await post(
        threadId,
        comment.path,
        comment,
        exchangeBody(comment.body, comment.reply, providerId),
      );
      const now = new Date().toISOString();
      const updated = await mutate(threadId, id, (comments) =>
        comments.map((candidate) =>
          candidate.id === id
            ? { ...candidate, state: "resolved" as const, github: { url }, updatedAt: now }
            : candidate,
        ),
      );
      return updated!;
    },
  });

  // ---------------------------------------------------------------------------
  // The `bb diff-comment` CLI: how an agent works the queue.
  // ---------------------------------------------------------------------------

  const usage = [
    "Usage:",
    "  bb diff-comment list [--all] [--json]     Comments on this thread's diff",
    "  bb diff-comment next [--json]             The next open comment, in full",
    "  bb diff-comment show <ref> [--json]       One comment, in full",
    "  bb diff-comment reply <ref> <text>        Say what you did; marks it addressed",
    "  bb diff-comment resolve <ref>             Close it (for the author, not the agent)",
    "  bb diff-comment reopen <ref>              Put it back in the queue",
    "",
    "<ref> is the #n from the listing, or a comment id.",
  ].join("\n");

  bb.cli.register({
    name: "diff-comment",
    summary: "Read and answer the review comments left on this thread's diff",
    commands: [
      {
        name: "list",
        summary: "List this thread's diff comments",
        usage: "bb diff-comment list [--all] [--json]",
      },
      {
        name: "next",
        summary: "Show the next open comment in full",
        usage: "bb diff-comment next [--json]",
      },
      {
        name: "show",
        summary: "Show one comment in full",
        usage: "bb diff-comment show <ref> [--json]",
      },
      {
        name: "reply",
        summary: "Record what you did and mark the comment addressed",
        usage: "bb diff-comment reply <ref> <text>",
      },
      {
        name: "resolve",
        summary: "Close a comment (the author's call, not the agent's)",
        usage: "bb diff-comment resolve <ref>",
      },
      {
        name: "reopen",
        summary: "Return a comment to the open queue",
        usage: "bb diff-comment reopen <ref>",
      },
    ],

    async run(argv, ctx) {
      const json = argv.includes("--json");
      const all = argv.includes("--all");
      const [command, ...args] = argv.filter((arg) => !arg.startsWith("--"));

      const reply = (value: unknown, text: string) => ({
        exitCode: 0,
        stdout: json ? JSON.stringify(value) : text,
      });

      if (command === undefined || command === "help") {
        return { exitCode: 0, stdout: usage };
      }

      // Every subcommand is about the diff of the thread the command ran in.
      // Without a thread there is nothing to talk about, and silently falling
      // back to "some other thread's comments" would be worse than saying so.
      const threadId = ctx.threadId;
      if (threadId === undefined) {
        return {
          exitCode: 1,
          stderr: "No thread in context. Run this inside a thread; comments belong to one.",
        };
      }

      const comments = ordered(await read(threadId));

      /** Resolve a `<ref>` argument to a comment, or explain why not. */
      const lookup = (raw: string | undefined) => {
        if (raw === undefined) return { error: usage };
        const ref = parseRef(raw);
        if (ref === null) {
          return { error: `"${raw}" is not a comment reference. Use #n from the listing, or an id.` };
        }
        const comment = resolveRef(comments, ref);
        if (comment === null) {
          return { error: `No comment ${raw} on this thread. Run "bb diff-comment list" to see them.` };
        }
        return { comment };
      };

      const changeState = async (raw: string | undefined, state: CommentState) => {
        const found = lookup(raw);
        if (found.comment === undefined) return { exitCode: 1, stderr: found.error! };
        const updated = await mutate(threadId, found.comment.id, (list) =>
          setState(list, found.comment!.id, state, new Date().toISOString()),
        );
        return reply(updated, formatRow(updated!));
      };

      switch (command) {
        case "list": {
          const visible = all
            ? comments
            : comments.filter((comment) => comment.state !== "resolved");
          if (visible.length === 0) {
            return reply(
              visible,
              all ? "No comments on this thread's diff." : "No open comments. (--all includes resolved.)",
            );
          }
          const counts = summarize(comments);
          const header = `${counts.open} open, ${counts.addressed} addressed, ${counts.resolved} resolved`;
          return reply(visible, [header, "", ...visible.map((c) => formatRow(c))].join("\n"));
        }

        case "next": {
          const comment = nextOpen(comments);
          if (comment === null) {
            return reply(null, "No open comments. Nothing left to work through.");
          }
          return reply(comment, formatDetail(comment));
        }

        case "show": {
          const found = lookup(args[0]);
          if (found.comment === undefined) return { exitCode: 1, stderr: found.error! };
          return reply(found.comment, formatDetail(found.comment));
        }

        case "reply": {
          const found = lookup(args[0]);
          if (found.comment === undefined) return { exitCode: 1, stderr: found.error! };
          const text = args.slice(1).join(" ").trim();
          if (text === "") {
            return {
              exitCode: 1,
              stderr: 'A reply needs text: bb diff-comment reply #1 "renamed it to activeCount"',
            };
          }
          const updated = await mutate(threadId, found.comment.id, (list) =>
            applyReply(list, found.comment!.id, text, new Date().toISOString()),
          );
          return reply(updated, formatRow(updated!));
        }

        case "resolve":
          return changeState(args[0], "resolved");

        case "reopen":
          return changeState(args[0], "open");
      }

      return { exitCode: 1, stderr: usage };
    },
  });
}
