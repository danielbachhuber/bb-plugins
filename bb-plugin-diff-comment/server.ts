// bb-plugin-diff-comment — backend.
//
// Three surfaces over one store: the diff overlay and panel (over RPC), the
// `bb diff-comment` CLI an agent works the queue with, and the skill in
// skills/diff-comments/SKILL.md that tells the agent how. Every write
// publishes a realtime signal so open windows refetch.
//
// Comments are keyed by thread because a changes-panel diff belongs to a
// thread. The CLI reads the thread from its invocation context, so an agent
// never has to name it.
import { randomUUID } from "node:crypto";
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

export const rpcContract = defineRpcContract(rpcShape);

/** kv keys are namespaced per thread; nothing reads across threads. */
function keyFor(threadId: string): string {
  return `comments:${threadId}`;
}

export default async function plugin(bb: BbPluginApi) {
  bb.log.info("loaded");

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
