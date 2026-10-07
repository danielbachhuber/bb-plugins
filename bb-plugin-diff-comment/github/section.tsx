// The pull request's open review threads, listed in the Diff comments panel.
//
// The diff shows a thread where its line still is. This lists every
// unresolved one, including the threads the diff cannot show: outdated ones,
// comments on a whole file, and lines bb's diff does not include.
import { useEffect, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { rpcContract } from "@/server";
import { threadUrl, type GithubReview, type GithubThread } from "./threads";

/** The thread's pull request review, or null when it has none. */
export function useGithubReview(threadId: string): GithubReview | null {
  const rpc = useRpc<typeof rpcContract>();
  const [loaded, setLoaded] = useState<{ threadId: string; review: GithubReview | null } | null>(
    null,
  );

  useEffect(() => {
    rpc.call("github_review", { threadId }).then(
      (result) => setLoaded({ threadId, review: result.review }),
      // GitHub being unavailable leaves the local comments working; the
      // server log says why.
      () => setLoaded({ threadId, review: null }),
    );
  }, [rpc, threadId]);

  return loaded?.threadId === threadId ? loaded.review : null;
}

/** Why a thread is not on the diff, when GitHub already knows. */
function note(thread: GithubThread): string | null {
  if (thread.line === null) return "File";
  if (thread.outdated) return "Outdated";
  return null;
}

function Row({ thread }: { thread: GithubThread }) {
  const first = thread.comments[0];
  const url = threadUrl(thread);
  const label = note(thread);
  const replies = thread.comments.length - 1;
  const pending = thread.comments.some((comment) => comment.pending);
  return (
    <li className="border-b px-3 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium">{first?.author ?? "ghost"}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {first?.body.split("\n").find((line) => line.trim() !== "") ?? ""}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 font-mono text-xs">
        <span className="break-all">
          {thread.path}
          {thread.line !== null ? `:${thread.line}` : ""}
          {thread.side === "old" ? " (old)" : ""}
        </span>
        {label !== null ? (
          <span className="border-muted-foreground/30 rounded-full border px-2 py-px font-sans text-[11px] leading-4">
            {label}
          </span>
        ) : null}
        {pending ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-px font-sans text-[11px] leading-4 text-amber-700 dark:text-amber-300">
            Pending
          </span>
        ) : null}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {replies > 0 ? (
          <span className="text-muted-foreground">
            {replies} {replies === 1 ? "reply" : "replies"}
          </span>
        ) : null}
        {url !== null ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground ml-auto underline-offset-2 hover:underline"
          >
            Open on GitHub
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function GithubSection({ review }: { review: GithubReview }) {
  const open = review.threads.filter((thread) => !thread.resolved);
  if (open.length === 0) return null;
  return (
    <section>
      <h2
        className={cn(
          "bg-muted/50 text-muted-foreground px-3 py-1.5 text-xs font-medium",
          "sticky top-0",
        )}
      >
        On GitHub · #{review.number}
      </h2>
      <ul>
        {open.map((thread) => (
          <Row key={thread.id} thread={thread} />
        ))}
      </ul>
    </section>
  );
}
