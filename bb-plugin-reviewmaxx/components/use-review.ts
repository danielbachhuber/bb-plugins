// This thread's review, refetched when a submit lands.
import { useCallback, useEffect, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { REVIEW_CHANGED, type ReviewResult } from "@/review/contract";
import type { rpcContract } from "@/server";

export function useReview(threadId: string) {
  const rpc = useRpc<typeof rpcContract>();
  // Stored with its thread id, so a late reply for a thread you left cannot
  // overwrite the one on screen.
  const [loaded, setLoaded] = useState<{ threadId: string; result: ReviewResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const refetch = useCallback(() => {
    rpc.call("review_get", { threadId }).then(
      (result) => {
        setLoaded({ threadId, result });
        setError(null);
        setGenerating(false);
      },
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  }, [rpc, threadId]);

  useEffect(refetch, [refetch]);
  useRealtime(REVIEW_CHANGED, refetch);

  const generate = useCallback(() => {
    setGenerating(true);
    rpc.call("review_generate", { threadId }).catch((cause: unknown) => {
      setGenerating(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [rpc, threadId]);

  return { result: loaded?.threadId === threadId ? loaded.result : null, error, generating, generate };
}
