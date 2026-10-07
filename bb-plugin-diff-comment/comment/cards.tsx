// The React pieces drawn on the diff: a saved comment, and the composer for a
// new one.
//
// These mount into light-DOM holders that the overlay projects into the diff
// through a named slot, so they are styled by bb's own stylesheet and can use
// bb's components. Nothing here knows about the shadow DOM.
import { Component, useEffect, useRef, useState } from "react";
import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "./time";
import type { Comment, CommentState } from "./types";

/** Whether a line can take a draft review comment on the pull request. */
export type GithubTarget =
  | { state: "off" }
  | { state: "blocked"; reason: string }
  | { state: "ready"; number: number };

/** The GitHub half of a composer or card: where it stands, and how to post. */
export interface GithubAction {
  /** Asked once when the composer or card mounts. */
  check: () => Promise<GithubTarget>;
  /** Resolves once GitHub has the comment; rejects with the reason it doesn't. */
  post: (body: string) => Promise<void>;
}

/** The card's version: what it posts is already written. */
export interface PostExchangeAction {
  check: () => Promise<GithubTarget>;
  post: () => Promise<void>;
}

/** Read the GitHub target once on mount. Null while it is being checked. */
function useGithubTarget(action: { check: () => Promise<GithubTarget> } | undefined): GithubTarget | null {
  const [target, setTarget] = useState<GithubTarget | null>(null);
  useEffect(() => {
    if (action === undefined) return;
    let live = true;
    action.check().then(
      (result) => {
        if (live) setTarget(result);
      },
      (cause: unknown) => {
        if (live) {
          setTarget({
            state: "blocked",
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      },
    );
    return () => {
      live = false;
    };
    // Checked once per mount: the composer is short-lived, and a card is
    // remounted whenever its comment changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return action === undefined ? { state: "off" } : target;
}

/**
 * A button that posts to GitHub, shown disabled with the reason in its
 * tooltip when the line can't take a review comment yet. The tooltip sits on
 * a wrapper because a disabled button does not receive the pointer.
 */
function GithubButton({
  target,
  label,
  busy,
  onClick,
}: {
  target: GithubTarget | null;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  if (target?.state === "off") return null;
  const reason =
    target === null
      ? "Checking the pull request…"
      : target.state === "blocked"
        ? target.reason
        : `Adds a draft to your pending review on #${target.number}. Only you see it until you submit the review on GitHub.`;
  return (
    <span title={reason} className="inline-flex">
      <Button
        size="sm"
        variant="outline"
        disabled={busy || target === null || target.state !== "ready"}
        onClick={onClick}
      >
        {label}
      </Button>
    </span>
  );
}

/** Why a post failed, under the actions that caused it. */
function PostError({ message }: { message: string | null }) {
  if (message === null) return null;
  return <p className="text-destructive border-t px-3 py-2 text-xs">{message}</p>;
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The overlay mounts these outside bb's React tree, so `Markdown` runs without
 * the app's providers around it. If that ever fails, a comment losing its
 * formatting is tolerable; a comment disappearing is not — so the failure
 * degrades to the raw text instead of an empty row.
 */
class MarkdownBoundary extends Component<{ text: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("[diff-comment] markdown failed, showing plain text", error, info);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <p className="whitespace-pre-wrap text-sm">{this.props.text}</p>;
    }
    return this.props.children;
  }
}

export function Body({ text }: { text: string }) {
  return (
    <MarkdownBoundary text={text}>
      <Markdown content={text} />
    </MarkdownBoundary>
  );
}

const STATE_LABEL: Record<CommentState, string> = {
  open: "Open",
  addressed: "Addressed",
  resolved: "Resolved",
};

const STATE_TONE: Record<CommentState, string> = {
  open: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  addressed: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  resolved: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

function StateBadge({ state }: { state: CommentState }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-px text-[11px] leading-4 font-medium",
        STATE_TONE[state],
      )}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

/**
 * Slotted content inherits from its flattened-tree parent, which is inside the
 * diff's shadow root — so without this the whole card inherits Pierre's 12px
 * monospace and reads like source code rather than like prose. The reset is
 * inline because it has to beat that inheritance wherever the card is slotted.
 */
const CARD_TYPE: CSSProperties = {
  fontFamily:
    'var(--font-sans, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
  fontSize: "13px",
  lineHeight: 1.5,
  textAlign: "left",
  whiteSpace: "normal",
};

/** Shared frame so the card and the composer sit identically in the diff. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      style={CARD_TYPE}
      className="bg-card text-card-foreground my-1.5 ml-2 mr-3 overflow-hidden rounded-md border shadow-sm"
    >
      {children}
    </div>
  );
}

/** The muted strip across the top of a card, as GitHub frames a review note. */
export function Header({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-xs">
      {children}
    </div>
  );
}

/** The tinted strip along the bottom that holds a card's actions. */
export function Footer({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex items-center gap-2 border-t px-3 py-2">{children}</div>
  );
}

/**
 * The write surface, shared by a new comment and an edit of an existing one.
 * Keeping them one component is what stops the two drifting apart — the first
 * version of this had a separate textarea in each, already with different
 * keyboard handling.
 */
function BodyEditor({
  initialBody,
  submitLabel,
  onSubmit,
  onCancel,
  github,
}: {
  initialBody: string;
  submitLabel: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
  /** Adds "Add to GitHub review" beside the submit button. */
  github?: GithubAction;
}) {
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = useGithubTarget(github);
  const box = useRef<HTMLTextAreaElement>(null);
  const ready = body.trim() !== "" && !busy;

  // Focus once, caret at the end. An inline `ref` callback would run on every
  // render — React re-attaches a ref whose identity changed — and so would
  // drag the caret back to the end on every keystroke, which is only
  // invisible when you happen to be typing at the end.
  useEffect(() => {
    const node = box.current;
    if (node === null) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const submit = () => {
    if (!ready) return;
    setBusy(true);
    onSubmit(body.trim());
  };

  // On failure the text stays in the box and the reason shows below, so
  // nothing written is lost to a GitHub error.
  const postToGithub = () => {
    if (!ready || github === undefined) return;
    setBusy(true);
    setError(null);
    github.post(body.trim()).catch((cause: unknown) => {
      setError(errorText(cause));
      setBusy(false);
    });
  };

  return (
    <>
      <div className="px-3 py-2.5">
        <textarea
          ref={box}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          // Cmd/Ctrl+Enter saves, matching how the composer behaves elsewhere
          // in bb; plain Enter has to stay available for writing prose.
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          rows={3}
          placeholder="Leave a comment. Markdown works."
          style={CARD_TYPE}
          className="border-input bg-background focus-visible:ring-ring w-full resize-y rounded-md border px-2 py-1.5 focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>

      <Footer>
        <Button size="sm" disabled={!ready} onClick={submit}>
          {submitLabel}
        </Button>
        {github !== undefined ? (
          <GithubButton
            target={target}
            label="Add to GitHub review"
            busy={!ready}
            onClick={postToGithub}
          />
        ) : null}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-muted-foreground ml-auto text-[11px]">⌘↵ to save</span>
      </Footer>
      <PostError message={error} />
    </>
  );
}

export interface CommentCardProps {
  comment: Comment;
  /** True when the commented code is no longer in the diff. */
  detached?: boolean;
  onSetState: (state: CommentState) => void;
  onEdit: (body: string) => void;
  onRemove: () => void;
  /**
   * Posts the comment and the agent's answer as one draft review comment.
   * Offered once the agent has answered and the comment is not on GitHub yet.
   */
  github?: PostExchangeAction;
}

export function CommentCard({
  comment,
  detached,
  onSetState,
  onEdit,
  onRemove,
  github,
}: CommentCardProps) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offerGithub =
    github !== undefined && comment.reply !== null && !comment.github && comment.state !== "resolved";
  const target = useGithubTarget(offerGithub ? github : undefined);

  const postToGithub = () => {
    if (github === undefined) return;
    setBusy(true);
    setError(null);
    github.post().catch((cause: unknown) => {
      setError(errorText(cause));
      setBusy(false);
    });
  };

  const act = (run: () => void) => () => {
    setBusy(true);
    run();
  };

  return (
    <Shell>
      <Header>
        <span className="text-muted-foreground font-mono">#{comment.seq}</span>
        <StateBadge state={comment.state} />
        {detached === true ? (
          <span
            className="text-muted-foreground border-muted-foreground/30 rounded-full border px-2 py-px text-[11px] leading-4"
            title="The line this was written about is no longer in the diff."
          >
            Detached
          </span>
        ) : null}
        <span className="text-muted-foreground ml-auto">
          {relativeTime(comment.createdAt, Date.now())}
        </span>
      </Header>

      {editing ? (
        <BodyEditor
          initialBody={comment.body}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSubmit={(body) => {
            setEditing(false);
            onEdit(body);
          }}
        />
      ) : null}

      {editing ? null : (
        <>
      <div className="px-3 py-2.5">
        <Body text={comment.body} />
      </div>

      {comment.reply !== null ? (
        <div className="bg-muted/20 border-t px-3 py-2.5">
          <p className="text-muted-foreground mb-1 text-xs font-medium">Agent replied</p>
          <Body text={comment.reply} />
        </div>
      ) : null}

      <Footer>
        {comment.state === "resolved" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={act(() => onSetState("open"))}>
            Reopen
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={act(() => onSetState("resolved"))}
          >
            Mark resolved
          </Button>
        )}
        {offerGithub ? (
          <GithubButton target={target} label="Post to GitHub" busy={busy} onClick={postToGithub} />
        ) : null}
        {comment.github ? (
          <a
            href={comment.github.url}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            On GitHub
          </a>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground ml-auto"
          disabled={busy}
          onClick={act(onRemove)}
        >
          Delete
        </Button>
      </Footer>
      <PostError message={error} />
        </>
      )}
    </Shell>
  );
}

export interface CommentComposerProps {
  /** Shown in the header so it is obvious which line is being commented on. */
  location: string;
  /** What the box opens with — a quote of the selected code, or nothing. */
  initialBody?: string;
  onSave: (body: string) => void;
  onCancel: () => void;
  /** Adds "Add to GitHub review", which posts instead of saving locally. */
  github?: GithubAction;
}

export function CommentComposer({
  location,
  initialBody,
  onSave,
  onCancel,
  github,
}: CommentComposerProps) {
  return (
    <Shell>
      <Header>
        <span className="text-muted-foreground font-mono">{location}</span>
      </Header>
      <BodyEditor
        initialBody={initialBody ?? ""}
        submitLabel="Comment"
        onSubmit={onSave}
        onCancel={onCancel}
        github={github}
      />
    </Shell>
  );
}
