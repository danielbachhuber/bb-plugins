// The thread panel: every comment on this thread's diff, in one list.
//
// The diff shows comments in place, which is the right view while you are
// reading code. This is the other view: what is still open, what the agent
// said it did, and the ones whose code has moved out from under them and are
// therefore invisible on the diff.
import { Button } from "@/components/ui/button";
import { GithubSection, useGithubReview } from "@/github/section";
import { cn } from "@/lib/utils";
import { relativeTime } from "./time";
import { useThreadComments } from "./useComments";
import type { Comment, CommentState } from "./types";

const GROUPS: Array<{ state: CommentState; title: string; empty: string }> = [
  { state: "open", title: "Open", empty: "Nothing open." },
  { state: "addressed", title: "Addressed", empty: "Nothing waiting on you." },
  { state: "resolved", title: "Resolved", empty: "Nothing resolved yet." },
];

function Row({
  comment,
  onSetState,
  onRemove,
  onAsk,
}: {
  comment: Comment;
  onSetState: (state: CommentState) => void;
  onRemove: () => void;
  onAsk: () => void;
}) {
  const asked = comment.askedAt != null;
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
        {comment.state === "open" && !asked ? (
          <Button size="sm" variant="ghost" onClick={onAsk}>
            Ask agent
          </Button>
        ) : null}
        {comment.state === "open" && asked ? (
          <span className="text-muted-foreground self-center px-2 text-xs">Asked the agent</span>
        ) : null}
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
        {comment.github ? (
          <a
            href={comment.github.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground self-center text-xs underline-offset-2 hover:underline"
          >
            On GitHub
          </a>
        ) : null}
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

export function CommentPanel({ threadId }: { threadId: string }) {
  const { comments, counts, error, refetch, rpc } = useThreadComments(threadId);
  const review = useGithubReview(threadId);
  const github = review !== null && review.threads.some((thread) => !thread.resolved);

  const setState = (id: string, state: CommentState) => {
    rpc.call("comments_set_state", { threadId, id, state }).then(refetch, refetch);
  };
  const remove = (id: string) => {
    rpc.call("comments_remove", { threadId, id }).then(refetch, refetch);
  };
  const ask = (id: string) => {
    rpc.call("comments_ask", { threadId, id }).then(refetch, refetch);
  };

  if (error !== null) {
    return <p className="text-destructive px-3 py-4 text-sm">{error}</p>;
  }
  if (comments === null) {
    return <p className="text-muted-foreground px-3 py-4 text-sm">Loading…</p>;
  }
  if (comments.length === 0 && !github) {
    return <Empty />;
  }

  return (
    <div>
      {comments.length > 0 ? (
        <p className="text-muted-foreground px-3 py-2 text-xs">
          {counts.open} open · {counts.addressed} addressed · {counts.resolved} resolved
        </p>
      ) : null}
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
                  onAsk={() => ask(comment.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
      {github ? <GithubSection review={review} /> : null}
    </div>
  );
}
