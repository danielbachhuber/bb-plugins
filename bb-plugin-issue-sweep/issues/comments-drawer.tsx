import { useEffect, useState, type ComponentType } from "react";
import type { SweepLinkProps } from "sweep-ui/row";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { IssueComment } from "./comments.js";
import { relativeTime } from "./format.js";

/**
 * The drawer a row's comment count opens: the issue's latest comments, oldest
 * first, each a link to it on GitHub, with the ones that arrived since the
 * issue was last seen marked new.
 */

export type CommentsResult = { comments: IssueComment[]; total: number; error: string | null };

const BLUE_TEXT = "text-[#0b57d0] dark:text-[#a8c7fa]";

function Who({ comment }: { comment: IssueComment }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 font-medium text-foreground">
      {comment.avatarUrl && !failed ? (
        <img
          src={comment.avatarUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-3.5 rounded-full bg-surface-selected"
        />
      ) : null}
      {comment.author}
    </span>
  );
}

function Entry({
  comment,
  isNew,
  now,
  Link,
}: {
  comment: IssueComment;
  isNew: boolean;
  now: number;
  Link: ComponentType<SweepLinkProps>;
}) {
  return (
    <li>
      <Link href={comment.url} className="block rounded px-2 py-1.5 hover:bg-accent">
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <Who comment={comment} />
          <span aria-hidden="true">·</span>
          <span>{relativeTime(comment.at, now)}</span>
          {isNew ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={cn("font-medium", BLUE_TEXT)}>new</span>
            </>
          ) : null}
        </span>
        {comment.body ? (
          <span className="mt-0.5 block text-xs whitespace-pre-line text-foreground">{comment.body}</span>
        ) : null}
      </Link>
    </li>
  );
}

export interface CommentsListProps {
  comments: IssueComment[];
  /** Every comment the issue has, so the list can say how many it leaves out. */
  total: number;
  /** How many of the latest comments to mark new. */
  newCount: number;
  now: number;
  /** The issue, for the link at the bottom. */
  url: string;
  Link: ComponentType<SweepLinkProps>;
}

export function CommentsList({ comments, total, newCount, now, url, Link }: CommentsListProps) {
  const firstNew = comments.length - newCount;
  const earlier = total - comments.length;
  return (
    <>
      {comments.length > 0 ? (
        <ul className="-mx-2 space-y-0.5">
          {comments.map((comment, index) => (
            <Entry key={`${comment.url}-${index}`} comment={comment} isNew={index >= firstNew} now={now} Link={Link} />
          ))}
        </ul>
      ) : (
        <p className="py-1 text-xs text-muted-foreground">No comments yet.</p>
      )}
      <div className="mt-1.5 flex items-center gap-3 border-t border-border pt-1.5 text-xs text-muted-foreground">
        <Link href={url} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
          {earlier > 0 ? `Open all ${total} on GitHub` : "Open the issue on GitHub"}
          <Icon name="ArrowUpRight" className="size-3" />
        </Link>
      </div>
    </>
  );
}

export interface CommentsDrawerProps {
  /** Reads the comments. Called once, when the drawer opens. */
  load: () => Promise<CommentsResult>;
  newCount: number;
  now: number;
  url: string;
  Link: ComponentType<SweepLinkProps>;
}

/** Loads the comments when it mounts, then draws them. */
export function CommentsDrawer({ load, newCount, now, url, Link }: CommentsDrawerProps) {
  const [result, setResult] = useState<CommentsResult | null>(null);
  // Held from the open, since reading the comments marks them seen and the row's count drops to zero.
  const [shownNew] = useState(newCount);
  useEffect(() => {
    let live = true;
    load()
      .then((loaded) => live && setResult(loaded))
      .catch(() => live && setResult({ comments: [], total: 0, error: "Could not read the comments from GitHub." }));
    return () => {
      live = false;
    };
    // Once per open: the drawer remounts when it is opened again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
      {result === null ? (
        <p className="inline-flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
          <Icon name="Spinner" className="size-3 animate-spin" />
          Reading comments…
        </p>
      ) : result.error ? (
        <p className="py-1 text-xs text-destructive-text">{result.error}</p>
      ) : (
        <CommentsList
          comments={result.comments}
          total={result.total}
          newCount={shownNew}
          now={now}
          url={url}
          Link={Link}
        />
      )}
    </div>
  );
}
