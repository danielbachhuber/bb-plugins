import { useEffect, useState, type ComponentType } from "react";
import type { SweepLinkProps } from "sweep-ui/row";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { FeedbackEntry } from "./feedback.js";
import { relativeTime } from "./format.js";

/**
 * The drawer a row's comment count opens: what reviewers left, each entry a
 * link to it on GitHub. The reviews and the threads still open come first;
 * resolved threads wait behind a toggle at the end.
 */

export type FeedbackResult = { entries: FeedbackEntry[]; error: string | null };

function Who({ entry }: { entry: FeedbackEntry }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 font-medium text-foreground">
      {entry.avatarUrl && !failed ? (
        <img src={entry.avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="size-3.5 rounded-full bg-surface-selected" />
      ) : null}
      {entry.author}
    </span>
  );
}

const REVIEW_TEXT = {
  changes_requested: <span className="font-medium text-destructive-text">requested changes</span>,
  approved: <span className="text-success">approved</span>,
  commented: <span>reviewed</span>,
} as const;

/** Where the entry sits and where it stands: "export/csv.ts:42 · unanswered". */
function Context({ entry, now }: { entry: FeedbackEntry; now: number }) {
  const parts =
    entry.kind === "review"
      ? [REVIEW_TEXT[entry.state], <span>{relativeTime(entry.at, now)}</span>]
      : entry.kind === "comment"
        ? [<span>commented</span>, <span>{relativeTime(entry.at, now)}</span>]
        : [
            <span className="font-mono text-[11px]">
              {entry.path}
              {entry.line !== null ? `:${entry.line}` : ""}
            </span>,
            entry.status === "unanswered" ? (
              <span className="font-medium text-destructive-text">unanswered</span>
            ) : (
              <span>{entry.status === "replied" ? "you replied" : "resolved"}</span>
            ),
            ...(entry.outdated ? [<span>outdated</span>] : []),
            ...(entry.replies > 0 ? [<span>{entry.replies === 1 ? "1 reply" : `${entry.replies} replies`}</span>] : []),
          ];
  return (
    <>
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden="true">·</span> : null}
          {part}
        </span>
      ))}
    </>
  );
}

function Entry({ entry, now, Link }: { entry: FeedbackEntry; now: number; Link: ComponentType<SweepLinkProps> }) {
  const quiet = entry.kind === "thread" && entry.status !== "unanswered";
  return (
    <li>
      <Link href={entry.url} className={cn("block rounded px-2 py-1.5 hover:bg-accent", quiet && "opacity-70")}>
        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <Who entry={entry} />
          <Context entry={entry} now={now} />
        </span>
        {entry.body ? (
          <span className="mt-0.5 line-clamp-3 text-xs whitespace-pre-line text-foreground">{entry.body}</span>
        ) : null}
      </Link>
    </li>
  );
}

export interface FeedbackListProps {
  entries: FeedbackEntry[];
  now: number;
  /** The pull request, for the link at the bottom. */
  url: string;
  Link: ComponentType<SweepLinkProps>;
}

/** The entries as they come, with resolved threads folded behind a toggle. */
export function FeedbackList({ entries, now, url, Link }: FeedbackListProps) {
  const [showResolved, setShowResolved] = useState(false);
  const resolved = entries.filter((entry) => entry.kind === "thread" && entry.status === "resolved");
  const shown = showResolved ? entries : entries.filter((entry) => !resolved.includes(entry));
  return (
    <>
      {shown.length > 0 ? (
        <ul className="-mx-2 space-y-0.5">
          {shown.map((entry, index) => (
            <Entry key={`${entry.url}-${index}`} entry={entry} now={now} Link={Link} />
          ))}
        </ul>
      ) : (
        <p className="py-1 text-xs text-muted-foreground">Nothing open from reviewers.</p>
      )}
      <div className="mt-1.5 flex items-center gap-3 border-t border-border pt-1.5 text-xs text-muted-foreground">
        <Link href={url} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
          Open the conversation on GitHub
          <Icon name="ArrowUpRight" className="size-3" />
        </Link>
        {resolved.length > 0 ? (
          <button
            type="button"
            className="-mx-1 rounded px-1 hover:bg-accent hover:text-foreground"
            onClick={() => setShowResolved(!showResolved)}
          >
            {showResolved ? "Hide resolved" : `${resolved.length} resolved`}
          </button>
        ) : null}
      </div>
    </>
  );
}

export interface FeedbackDrawerProps {
  /** Reads the entries. Called once, when the drawer opens. */
  load: () => Promise<FeedbackResult>;
  now: number;
  url: string;
  Link: ComponentType<SweepLinkProps>;
}

/** Loads the entries when it mounts, then draws them. */
export function FeedbackDrawer({ load, now, url, Link }: FeedbackDrawerProps) {
  const [result, setResult] = useState<FeedbackResult | null>(null);
  useEffect(() => {
    let live = true;
    load()
      .then((loaded) => live && setResult(loaded))
      .catch(() => live && setResult({ entries: [], error: "Could not read the comments from GitHub." }));
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
        <FeedbackList entries={result.entries} now={now} url={url} Link={Link} />
      )}
    </div>
  );
}
