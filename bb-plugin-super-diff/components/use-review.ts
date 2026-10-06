// This thread's review, refetched when a submit lands and when the window
// regains focus, so a file marked Viewed on GitHub shows here.
import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { REVIEW_CHANGED, type ReviewResult } from "@/review/contract";
import type { rpcContract } from "@/server";

/**
 * The last result per thread, kept outside the component. bb remounts a panel
 * tab when it is switched back to or resized, and without this each remount
 * blanked the panel to "Reading the branch…" until git answered again.
 */
const lastResult = new Map<string, ReviewResult>();

export function useReview(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  // Stored with its thread id, so a late reply for a thread you left cannot
  // overwrite the one on screen.
  const [loaded, setLoaded] = useState<{ threadId: string; result: ReviewResult } | null>(() => {
    const cached = lastResult.get(threadId);
    return cached ? { threadId, result: cached } : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  /** What GitHub said when it did not take a Viewed change; the marks here were kept. */
  const [notice, setNotice] = useState<string | null>(null);

  const refetch = useCallback(() => {
    rpc.call("review_get", { threadId }).then(
      (result) => {
        lastResult.set(threadId, result);
        setLoaded({ threadId, result });
        setError(null);
        setGenerating(false);
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc, threadId]);

  useEffect(refetch, [refetch]);
  useRealtime(REVIEW_CHANGED, refetch);
  useEffect(() => {
    window.addEventListener("focus", refetch);
    return () => window.removeEventListener("focus", refetch);
  }, [refetch]);

  const generate = useCallback(() => {
    setGenerating(true);
    rpc.call("review_generate", { threadId }).catch((cause: unknown) => {
      setGenerating(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [rpc, threadId]);

  const afterChange = useCallback(
    (reply: { error: string | null }) => {
      setNotice(reply.error);
      refetch();
    },
    [refetch],
  );
  const failed = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)), []);

  const setRead = useCallback(
    (path: string, hunks: number[], read: boolean) => {
      rpc.call("review_set_read", { threadId, path, hunks, read }).then(afterChange, failed);
    },
    [rpc, threadId, afterChange, failed],
  );

  const setFileViewed = useCallback(
    (path: string, viewed: boolean) => {
      rpc.call("review_set_file_viewed", { threadId, path, viewed }).then(afterChange, failed);
    },
    [rpc, threadId, afterChange, failed],
  );

  const result = loaded?.threadId === threadId ? loaded.result : (lastResult.get(threadId) ?? null);
  return { result, error, notice, generating, generate, setRead, setFileViewed };
}
