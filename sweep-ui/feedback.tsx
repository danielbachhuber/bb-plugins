import { useEffect, useState, type ComponentType } from "react";

import { Icon } from "./icons";
import type { SweepLinkProps } from "./row";

/**
 * The drawer a row's comment count opens: what people left on the pull
 * request, each entry a link to it on GitHub, oldest first. An inline comment
 * sits in a card headed by its file and line; reviews and top-level comments
 * do not. Yours and bots' carry a "you" or "bot" label. Resolved threads wait
 * behind a toggle at the end.
 */

/** One entry, as `fetchFeedback` in `@danielb/gh-shared/gh` reads it. */
export type FeedbackEntry =
  | {
      kind: "review";
      author: string;
      avatarUrl: string;
      bot?: boolean;
      you?: boolean;
      state: "changes_requested" | "approved" | "commented";
      body: string;
      url: string;
      at: number;
    }
  | {
      kind: "thread";
      author: string;
      avatarUrl: string;
      bot?: boolean;
      you?: boolean;
      path: string;
      line: number | null;
      status: "unanswered" | "replied" | "waiting" | "resolved";
      outdated: boolean;
      replies: number;
      body: string;
      url: string;
      at: number;
    }
  | {
      kind: "comment";
      author: string;
      avatarUrl: string;
      bot?: boolean;
      you?: boolean;
      body: string;
      url: string;
      at: number;
    };

export type FeedbackResult = { entries: FeedbackEntry[]; error: string | null };

function Label({ children }: { children: string }) {
  return <span className="rounded bg-surface-selected px-1 text-[10px] font-normal text-muted-foreground">{children}</span>;
}

function Who({ entry }: { entry: FeedbackEntry }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="inline-flex items-center gap-1 font-medium text-foreground">
      {entry.avatarUrl && !failed ? (
        <img src={entry.avatarUrl} alt="" loading="lazy" onError={() => setFailed(true)} className="size-3.5 rounded-full bg-surface-selected" />
      ) : null}
      {entry.author}
      {entry.bot ? <Label>bot</Label> : null}
      {entry.you ? <Label>you</Label> : null}
    </span>
  );
}

const REVIEW_TEXT = {
  changes_requested: <span className="font-medium text-destructive-text">requested changes</span>,
  approved: <span className="text-success">approved</span>,
  commented: <span>reviewed</span>,
} as const;

const THREAD_TEXT = { replied: "you replied", waiting: "waiting on a reply", resolved: "resolved" } as const;

/** What the entry did or where it stands, and when: "unanswered · 1 reply · 2d ago". */
function Context({ entry, age }: { entry: FeedbackEntry; age: (at: number) => string }) {
  const parts =
    entry.kind === "review"
      ? [REVIEW_TEXT[entry.state], <span>{age(entry.at)}</span>]
      : entry.kind === "comment"
        ? [<span>commented</span>, <span>{age(entry.at)}</span>]
        : [
            entry.status === "unanswered" ? (
              <span className="font-medium text-destructive-text">unanswered</span>
            ) : (
              <span>{THREAD_TEXT[entry.status]}</span>
            ),
            ...(entry.outdated ? [<span>outdated</span>] : []),
            ...(entry.replies > 0 ? [<span>{entry.replies === 1 ? "1 reply" : `${entry.replies} replies`}</span>] : []),
            <span>{age(entry.at)}</span>,
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

/** An inline comment in a card headed by its file and line; anything else as a plain row. */
function Entry({ entry, age, Link }: { entry: FeedbackEntry; age: (at: number) => string; Link: ComponentType<SweepLinkProps> }) {
  const content = (
    <>
      <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <Who entry={entry} />
        <Context entry={entry} age={age} />
      </span>
      {entry.body ? <span className="mt-0.5 line-clamp-3 text-xs whitespace-pre-line text-foreground">{entry.body}</span> : null}
    </>
  );
  if (entry.kind !== "thread") {
    return (
      <li>
        <Link href={entry.url} className="block rounded px-2 py-1.5 hover:bg-accent">
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li className="py-0.5">
      <Link href={entry.url} className="block overflow-hidden rounded border border-border bg-background hover:bg-accent">
        <span className="block border-b border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {entry.path}
          {entry.line !== null ? `:${entry.line}` : ""}
        </span>
        <span className="block px-2 py-1.5">{content}</span>
      </Link>
    </li>
  );
}

export interface FeedbackListProps {
  entries: FeedbackEntry[];
  /** How long ago a time was, in the plugin's own words: "2d ago". */
  age: (at: number) => string;
  /** The pull request, for the link at the bottom. */
  url: string;
  Link: ComponentType<SweepLinkProps>;
}

/** The entries as they come, with resolved threads folded behind a toggle. */
export function FeedbackList({ entries, age, url, Link }: FeedbackListProps) {
  const [showResolved, setShowResolved] = useState(false);
  const resolved = entries.filter((entry) => entry.kind === "thread" && entry.status === "resolved");
  const shown = showResolved ? entries : entries.filter((entry) => !resolved.includes(entry));
  return (
    <>
      {shown.length > 0 ? (
        <ul className="-mx-2 space-y-0.5">
          {shown.map((entry, index) => (
            <Entry key={`${entry.url}-${index}`} entry={entry} age={age} Link={Link} />
          ))}
        </ul>
      ) : (
        <p className="py-1 text-xs text-muted-foreground">Nothing open.</p>
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
  age: (at: number) => string;
  url: string;
  Link: ComponentType<SweepLinkProps>;
}

/** Loads the entries when it mounts, then draws them. */
export function FeedbackDrawer({ load, age, url, Link }: FeedbackDrawerProps) {
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
        <FeedbackList entries={result.entries} age={age} url={url} Link={Link} />
      )}
    </div>
  );
}
