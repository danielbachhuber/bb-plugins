// This thread's comments, kept current.
//
// Shared by the panel and the thread-header button so both read one source and
// both refresh on the same signal — including a write from `bb diff-comment`
// in an agent's shell, which is the case that matters while it works.
import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { COMMENTS_CHANGED } from "./contract";
import { ordered, summarize, type CommentSummary } from "./store";
import type { Comment } from "./types";
import type { rpcContract } from "@/server";

export interface ThreadComments {
  /** Null until the first load finishes. */
  comments: Comment[] | null;
  counts: CommentSummary;
  error: string | null;
  refetch: () => void;
  rpc: ReturnType<typeof useRpc<typeof rpcContract>>;
}

const EMPTY: CommentSummary = { open: 0, addressed: 0, resolved: 0, total: 0 };

export function useThreadComments(threadId: string): ThreadComments {
  const rpc = useRpc<typeof rpcContract>();
  // The thread is stored WITH its comments. Keeping them apart let a thread
  // with no comments briefly show the previous thread's count, because the
  // state survived the prop change until the refetch landed — and a late reply
  // for a thread you had already left could overwrite the current one.
  const [loaded, setLoaded] = useState<{ threadId: string; comments: Comment[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    rpc.call("comments_list", { threadId }).then(
      (result) => {
        setLoaded({ threadId, comments: ordered(result.comments) });
        setError(null);
      },
      (cause: unknown) => {
        // Never let the failing branch be the silent one: an empty panel with
        // no explanation is the hardest thing to debug from a screenshot.
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, [rpc, threadId]);

  useEffect(refetch, [refetch]);
  useRealtime(COMMENTS_CHANGED, refetch);

  const comments = loaded?.threadId === threadId ? loaded.comments : null;

  return {
    comments,
    counts: comments === null ? EMPTY : summarize(comments),
    error,
    refetch,
    rpc,
  };
}
