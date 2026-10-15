// What a markdown file's tab draws, given the editor's state.
//
// app.tsx owns the reads, writes, keyboard, and selection tracking, and
// passes the results in, so a story can render every state without a server.
import { useState, type RefObject } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { canSave, isDirty, type EditorState } from "./save";
import { ANCHOR_HEIGHT, ANCHOR_WIDTH } from "./selection";
import type { MarkdownDocument } from "./document";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type View = "preview" | "raw";


/** Split a path so the filename can carry the emphasis and the rest recede. */
function splitPath(path: string): { directory: string; name: string } {
  const index = path.lastIndexOf("/");
  if (index < 0) return { directory: "", name: path };
  return { directory: path.slice(0, index + 1), name: path.slice(index + 1) };
}

function SegmentButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon name={icon} className="size-3.5" />
      {label}
    </button>
  );
}

/**
 * The floating "Add to chat" button, positioned over the preview's scrolled
 * content.
 *
 * `onMouseDown` has to be cancelled: a mousedown anywhere in the document
 * collapses the selection, which unmounts this button before its click ever
 * fires. Cancelling the default leaves the selection intact and lets the
 * click through, and costs nothing else — the button has no drag or focus
 * behavior worth keeping.
 *
 * The fill is an inline style, and the variant is `ghost` so that nothing
 * else sets one. A button floating over a document needs an opaque background
 * in every state, and no variant here offers that: `outline` is
 * `bg-transparent`, and every variant's hover is a translucent tint. Adding an
 * opaque `bg-*` class alongside one of those is two utilities competing for
 * the same property, and which wins is decided by the order Tailwind happened
 * to emit them in — `bg-transparent` beat `bg-background`, and the paragraph
 * underneath read straight through the button. An inline style outranks every
 * class, so the two states are named here instead.
 */
function AddToChatButton({
  anchor,
  onAdd,
}: {
  anchor: { left: number; top: number };
  onAdd: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      style={{
        left: anchor.left,
        top: anchor.top,
        width: ANCHOR_WIDTH,
        height: ANCHOR_HEIGHT,
        backgroundColor: hovered ? "var(--muted)" : "var(--background)",
      }}
      className="absolute z-10 gap-1.5 border border-border px-2 text-xs shadow-md"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAdd}
    >
      <Icon name="MessageSquarePlus" className="size-3.5" />
      Add to chat
    </Button>
  );
}

export interface EditorTabViewProps {
  path: string;
  state: EditorState;
  view: View;
  /** The buffer as Preview renders it, with sibling images pointed at the asset route. */
  previewContent: string;
  markdownDocument: MarkdownDocument | undefined;
  /** Whether Discard is one click from throwing the buffer away. */
  discardArmed: boolean;
  /** Where the "Add to chat" button sits, or null when nothing is selected. */
  selection: { left: number; top: number } | null;
  rootRef?: RefObject<HTMLDivElement | null>;
  /** The preview's scrolling box, which the selection button is placed inside. */
  previewRef?: RefObject<HTMLDivElement | null>;
  onViewChange: (view: View) => void;
  onEdit: (content: string) => void;
  onSave: () => void;
  onOverwrite: () => void;
  onReload: () => void;
  onDiscard: () => void;
  onAddToChat: () => void;
}

export function EditorTabView({
  path,
  state,
  view,
  previewContent,
  markdownDocument,
  discardArmed,
  selection,
  rootRef,
  previewRef,
  onViewChange,
  onEdit,
  onSave,
  onOverwrite,
  onReload,
  onDiscard,
  onAddToChat,
}: EditorTabViewProps) {
  const { directory, name } = splitPath(path);
  const dirty = isDirty(state);
  const status = (() => {
    if (state.status === "loading") return "Loading…";
    if (state.status === "saving") return "Saving…";
    if (dirty) return "Unsaved changes";
    if (state.loaded !== null) return "Saved";
    return "";
  })();

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col outline-none"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <Icon name="FileText" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs">
          <span className="text-muted-foreground">{directory}</span>
          <span className="text-foreground">{name}</span>
        </span>

        {/*
          Discard rides on the save state rather than sitting among the
          controls: it is a tertiary action, and the `link` variant stripped
          of its padding lets it read as part of the same line of text. The
          fixed width reserves room for the question mark so arming shifts
          nothing.
        */}
        <div className="flex shrink-0 items-center gap-2.5 text-xs">
          <span className={cn(dirty ? "text-foreground" : "text-muted-foreground")}>
            {status}
          </span>

          {dirty && state.status !== "conflict" ? (
            <Button
              variant="link"
              className={cn(
                "h-auto w-[3.5rem] justify-start p-0 text-xs",
                discardArmed
                  ? "font-medium text-destructive underline"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-label={
                discardArmed
                  ? `Confirm discarding unsaved changes to ${name}`
                  : `Discard unsaved changes to ${name}`
              }
              onClick={onDiscard}
            >
              {discardArmed ? "Discard?" : "Discard"}
            </Button>
          ) : null}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Reload from disk"
          onClick={onReload}
          disabled={state.status === "loading" || state.status === "saving"}
        >
          <Icon name="RotateCcw" className="size-4" />
        </Button>

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
          <SegmentButton
            active={view === "preview"}
            onClick={() => onViewChange("preview")}
            icon="Eye"
            label="Preview"
          />
          <SegmentButton
            active={view === "raw"}
            onClick={() => onViewChange("raw")}
            icon="Code"
            label="Raw"
          />
        </div>

        <Button
          size="sm"
          className="h-7 shrink-0"
          onClick={onSave}
          disabled={!canSave(state)}
        >
          Save
        </Button>
      </div>

      {state.status === "conflict" ? (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted px-3 py-2 text-xs"
        >
          <Icon name="AlertTriangle" className="size-4 shrink-0 text-destructive" />
          <span className="flex-1">
            {state.message} Your edits are still here, unsaved.
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={onReload}>
            Reload, discard mine
          </Button>
          <Button size="sm" variant="destructive" className="h-7" onClick={onOverwrite}>
            Overwrite
          </Button>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div
          role="alert"
          className="shrink-0 border-b border-border px-3 py-2 text-xs text-destructive"
        >
          {state.message}
        </div>
      ) : null}

      {view === "preview" ? (
        // The page is white (or the theme's background in a dark theme) while
        // the header above keeps the panel's own tint, which is how bb's
        // native file preview reads: a toolbar over a document.
        <div
          ref={previewRef}
          className="relative min-h-0 flex-1 overflow-y-auto bg-background"
        >
          <div className="mx-auto box-border w-full max-w-3xl px-4 py-4">
            <Markdown
              content={previewContent}
              experimental_document={markdownDocument}
            />
          </div>
          {selection === null ? null : (
            <AddToChatButton anchor={selection} onAdd={onAddToChat} />
          )}
        </div>
      ) : (
        <textarea
          value={state.buffer}
          onChange={(event) => onEdit(event.target.value)}
          // Nothing loaded means nothing can be saved, so the textarea stays
          // read-only rather than inviting edits into a buffer with no file
          // behind it.
          readOnly={state.loaded === null}
          spellCheck={false}
          aria-label={`Markdown source of ${name}`}
          // Editing is the point, so the textarea gets the whole pane and no
          // resize handle: the tab already decides how tall it is.
          className="min-h-0 flex-1 resize-none bg-background px-4 py-3 font-mono text-sm leading-relaxed text-foreground outline-none"
        />
      )}
    </div>
  );
}
