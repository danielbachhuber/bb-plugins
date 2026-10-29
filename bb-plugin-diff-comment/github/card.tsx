// A GitHub review thread, drawn on the diff where it was left.
//
// Replying and resolving happen on GitHub, through the link in the header, so
// there is one copy of the conversation. Editing is the exception: a comment
// the viewer wrote, pending or submitted, can be rewritten in
// place, because that changes the one copy rather than adding a second.
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Body, BodyEditor, Header, Shell } from "@/comment/cards";
import { relativeTime } from "@/comment/time";
import type { GithubComment, GithubThread } from "./threads";
import { threadUrl } from "./threads";

export interface GithubThreadCardProps {
  thread: GithubThread;
  /** The pull request number, for the header. */
  number: number;
  /**
   * Replaces a comment's text on GitHub. Offered on the comments GitHub lets
   * the viewer edit; rejects with the reason GitHub refused.
   */
  onEdit?: (commentId: string, body: string) => Promise<void>;
  /** Injected so a story can pin "3 days ago". */
  now?: number;
}

function CommentRow({
  comment,
  at,
  onEdit,
}: {
  comment: GithubComment;
  at: number;
  onEdit?: (commentId: string, body: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  // What was saved, shown until the next read of the review catches up.
  const [saved, setSaved] = useState<string | null>(null);
  const body = saved ?? comment.body;
  const editable = comment.editable && onEdit !== undefined;

  return (
    <div className="border-b last:border-b-0">
      <p className="mb-1 flex items-center gap-2 px-3 pt-2.5 text-xs">
        <span className="font-medium">{comment.author ?? "ghost"}</span>
        {comment.pending ? (
          <span
            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-px text-[11px] leading-4 font-medium text-amber-700 dark:text-amber-300"
            title="A draft on your review. Only you can see it until you submit the review."
          >
            Pending
          </span>
        ) : null}
        <span className="text-muted-foreground">{relativeTime(comment.createdAt, at)}</span>
        {editable && !editing ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground ml-auto h-6 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            Edit
          </Button>
        ) : null}
      </p>
      {editing ? (
        <BodyEditor
          initialBody={body}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={(next) =>
            onEdit!(comment.id, next).then(() => {
              setSaved(next);
              setEditing(false);
            })
          }
        />
      ) : (
        <div className="px-3 pb-2.5">
          <Body text={body} />
        </div>
      )}
    </div>
  );
}

export function GithubThreadCard({ thread, number, onEdit, now }: GithubThreadCardProps) {
  const url = threadUrl(thread);
  const at = now ?? Date.now();

  return (
    <Shell>
      <Header>
        <HugeiconsIcon icon={GithubIcon} size={14} className="text-muted-foreground" />
        <span className="text-muted-foreground">Review comment on #{number}</span>
        {url !== null ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground ml-auto underline-offset-2 hover:underline"
          >
            Reply on GitHub
          </a>
        ) : null}
      </Header>
      {thread.comments.map((comment) => (
        <CommentRow key={comment.id} comment={comment} at={at} onEdit={onEdit} />
      ))}
    </Shell>
  );
}
