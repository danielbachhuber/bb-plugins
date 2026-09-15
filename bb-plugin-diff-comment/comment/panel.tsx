// The thread panel: every comment on this thread's diff, in one list.
//
// The diff shows comments in place, which is the right view while you are
// reading code. This is the other view: what is still open, what the agent
// said it did, and the ones whose code has moved out from under them and are
// therefore invisible on the diff.
import { useCallback, useEffect, useState } from "react";
import { useComposer, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { COMMENTS_CHANGED } from "./contract";
import { ordered, summarize } from "./store";
import { relativeTime } from "./time";
import type { Comment, CommentState } from "./types";
import type { rpcContract } from "@/server";

const GROUPS: Array<{ state: CommentState; title: string; empty: string }> = [
  { state: "open", title: "Open", empty: "Nothing open." },
  { state: "addressed", title: "Addressed", empty: "Nothing waiting on you." },
  { state: "resolved", title: "Resolved", empty: "Nothing resolved yet." },
];

function Row({
  comment,
  onSetState,
  onRemove,
}: {
  comment: Comment;
  onSetState: (state: CommentState) => void;
  onRemove: () => void;
}) {
  return (
    <li className="border-b px-3 py-3 last:border-b-0">
      <div className="flex items-baseline gap-2">
        <span className="text-muted-foreground font-mono text-xs">#{comment.seq}</span>
        <span className="min-w-0 flex-1 text-sm break-words">
          {comment.body.split("\n").find((line) => line.trim() !== "") ?? ""}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 font-mono text-xs break-words">
        {comment.path}:{comment.line}
        {comment.side === "old" ? " (old)" : ""}
      </p>
      {comment.reply !== null ? (
        <p className="mt-2 border-l-2 pl-2 text-xs">{comment.reply}</p>
      ) : null}
      <div className="mt-2 flex gap-1">
        {comment.state === "resolved" ? (
          <Button size="sm" variant="ghost" onClick={() => onSetState("open")}>
            Reopen
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onSetState("resolved")}>
            Mark resolved
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Delete
        </Button>
        <span className="text-muted-foreground ml-auto text-[11px]">
          {relativeTime(comment.updatedAt, Date.now())}
        </span>
      </div>
    </li>
  );
}

/**
 * An empty state drawn from the subject's own world rather than grey bars,
 * which read as "still loading".
 */
function Empty() {
  return (
    <div className="text-muted-foreground px-3 py-10 text-center text-sm">
      <pre className="mb-3 leading-tight opacity-60">{`  1 │ function widget() {
  2 │   return 1;
    ╰─▶ ______________`}</pre>
      <p>No comments on this diff yet.</p>
      <p className="mt-1 text-xs">
        Hover a line in the changes panel and press the comment button beside bb's own.
      </p>
    </div>
  );
}

/**
 * Hands the open comments to the agent by filling this thread's composer.
 *
 * It stops at filling the draft rather than sending it. The SDK has no
 * "submit now" — `experimental_submit` only schedules — and that is a
 * deliberate limit rather than a gap to work around: sending a message on your
 * behalf is your affordance, not a plugin's. So this writes the prompt and you
 * press Enter.
 *
 * The prompt routes to the skill instead of restating the procedure. A prompt
 * that re-explains how to work the queue only contradicts the skill that owns
 * it the first time either one changes.
 */
function SendToAgent({ open }: { open: number }) {
  const composer = useComposer();
  const [sent, setSent] = useState(false);

  if (open === 0) return null;

  const send = () => {
    composer.setText(
      `Work through the ${open} open comment${open === 1 ? "" : "s"} on this diff, ` +
        `one at a time, using the diff-comments skill.`,
    );
    setSent(true);
  };

  return (
    <div className="ml-auto flex items-center gap-2">
      {sent ? (
        <span className="text-muted-foreground text-[11px]">In the composer — press ↵</span>
      ) : null}
      <Button size="sm" variant="outline" onClick={send}>
        Send to agent
      </Button>
    </div>
  );
}

export function CommentPanel({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    rpc.call("comments_list", { threadId }).then(
      (result) => {
        setComments(ordered(result.comments));
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
  // Published after every write, including from `bb diff-comment` in an
  // agent's shell, so the list keeps up while the agent works.
  useRealtime(COMMENTS_CHANGED, refetch);

  const setState = (id: string, state: CommentState) => {
    rpc.call("comments_set_state", { threadId, id, state }).then(refetch, setError as () => void);
  };
  const remove = (id: string) => {
    rpc.call("comments_remove", { threadId, id }).then(refetch, setError as () => void);
  };

  if (error !== null) {
    return <p className="text-destructive px-3 py-4 text-sm">{error}</p>;
  }
  if (comments === null) {
    return <p className="text-muted-foreground px-3 py-4 text-sm">Loading…</p>;
  }
  if (comments.length === 0) {
    return <Empty />;
  }

  const counts = summarize(comments);

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <p className="text-muted-foreground text-xs">
          {counts.open} open · {counts.addressed} addressed · {counts.resolved} resolved
        </p>
        <SendToAgent open={counts.open} />
      </div>
      {GROUPS.map((group) => {
        const rows = comments.filter((comment) => comment.state === group.state);
        if (rows.length === 0) return null;
        return (
          <section key={group.state}>
            <h2
              className={cn(
                "bg-muted/50 text-muted-foreground px-3 py-1.5 text-xs font-medium",
                "sticky top-0",
              )}
            >
              {group.title}
            </h2>
            <ul>
              {rows.map((comment) => (
                <Row
                  key={comment.id}
                  comment={comment}
                  onSetState={(state) => setState(comment.id, state)}
                  onRemove={() => remove(comment.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
