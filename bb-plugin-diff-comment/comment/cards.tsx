// The React pieces drawn on the diff: a saved comment, and the composer for a
// new one.
//
// These mount into light-DOM holders that the overlay projects into the diff
// through a named slot, so they are styled by bb's own stylesheet and can use
// bb's components. Nothing here knows about the shadow DOM.
import { Component, useState } from "react";
import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { relativeTime } from "./time";
import type { Comment, CommentState } from "./types";

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

function Body({ text }: { text: string }) {
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
function Shell({ children }: { children: ReactNode }) {
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
function Header({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-xs">
      {children}
    </div>
  );
}

/** The tinted strip along the bottom that holds a card's actions. */
function Footer({ children }: { children: ReactNode }) {
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
}: {
  initialBody: string;
  submitLabel: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const ready = body.trim() !== "" && !busy;

  const submit = () => {
    if (!ready) return;
    setBusy(true);
    onSubmit(body.trim());
  };

  return (
    <>
      <div className="px-3 py-2.5">
        <textarea
          autoFocus
          // Focusing a textarea that already holds text would otherwise put
          // the caret at the start — in front of a quote, or at the beginning
          // of the sentence being edited.
          ref={(node) => {
            if (node !== null) node.setSelectionRange(node.value.length, node.value.length);
          }}
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
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-muted-foreground ml-auto text-[11px]">⌘↵ to save</span>
      </Footer>
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
}

export function CommentCard({
  comment,
  detached,
  onSetState,
  onEdit,
  onRemove,
}: CommentCardProps) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

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
}

export function CommentComposer({
  location,
  initialBody,
  onSave,
  onCancel,
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
      />
    </Shell>
  );
}
