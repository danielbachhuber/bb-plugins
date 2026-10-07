// A GitHub review thread, drawn on the diff where it was left.
//
// Read-only. Replying, resolving, and editing happen on GitHub, through the
// link in the header, so there is one copy of the conversation and no second
// set of controls to keep in step with it.
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon } from "@hugeicons/core-free-icons";
import { Body, Header, Shell } from "@/comment/cards";
import { relativeTime } from "@/comment/time";
import type { GithubThread } from "./threads";
import { threadUrl } from "./threads";

export interface GithubThreadCardProps {
  thread: GithubThread;
  /** The pull request number, for the header. */
  number: number;
  /** Injected so a story can pin "3 days ago". */
  now?: number;
}

export function GithubThreadCard({ thread, number, now }: GithubThreadCardProps) {
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
        <div key={comment.id} className="border-b px-3 py-2.5 last:border-b-0">
          <p className="mb-1 flex items-center gap-2 text-xs">
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
          </p>
          <Body text={comment.body} />
        </div>
      ))}
    </Shell>
  );
}
