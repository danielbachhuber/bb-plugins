// bb-plugin-markdown-editor — frontend entry.
//
// Registers a `fileOpener`, which means this component becomes the entire
// body of a markdown file's tab, plus a content script that offers a pencil on
// markdown files in bb's changes panel (see diff/engine.ts).
//
// bb's own preview is still reachable through the tab's "Open with" menu; we
// do not render it here, because delegating to it would put its Preview/Raw
// control underneath ours and leave two segmented controls arguing about which
// view is showing.
//
// There is no filesystem API on this side, so every read and write is an RPC
// to server.ts. The state rules live in editor/save.ts; this file is the
// wiring, the keyboard, and the chrome.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Markdown,
  definePluginApp,
  useComposer,
  useRpc,
  type PluginFileOpenerProps,
} from "@get-bb/plugin-sdk/app";
import type { FileSource, rpcContract } from "./server";
import {
  canSave,
  expectedSha,
  initialState,
  isDirty,
  reduce,
} from "./editor/save";
import {
  ANCHOR_HEIGHT,
  ANCHOR_WIDTH,
  anchorForSelection,
  quoteForSelection,
} from "./editor/selection";
import { EDITABLE_EXTENSIONS } from "./diff/extensions";
import { startEngine } from "./diff/engine";
import {
  buildAssetUrl,
  findImageRefs,
  imageMimeType,
  isSiblingRef,
  replaceImageUrls,
  resolveSibling,
} from "./editor/images";
import { buildMarkdownDocument } from "./editor/document";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type View = "preview" | "raw";

/** Split a path so the filename can carry the emphasis and the rest recede. */
function splitPath(path: string): { directory: string; name: string } {
  const index = path.lastIndexOf("/");
  if (index < 0) return { directory: "", name: path };
  return { directory: path.slice(0, index + 1), name: path.slice(index + 1) };
}

/**
 * The SDK marks the explicit host as experimental and so spells it
 * `experimental_hostId`. Renaming it at this one boundary keeps the
 * experimental name out of the wire contract and out of server.ts.
 */
function toWireSource(source: PluginFileOpenerProps["source"]): FileSource {
  const wire: FileSource = {
    kind: source.kind,
    threadId: source.threadId,
    environmentId: source.environmentId,
    projectId: source.projectId,
  };
  if (source.experimental_hostId !== undefined) {
    wire.hostId = source.experimental_hostId;
  }
  return wire;
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

function MarkdownEditorTab({ path, source }: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const composer = useComposer();
  const [state, dispatch] = useReducer(reduce, initialState);
  const [view, setView] = useState<View>("preview");
  const rootRef = useRef<HTMLDivElement>(null);
  /** The preview's scrolling box, which the selection button is placed inside. */
  const previewRef = useRef<HTMLDivElement>(null);
  /**
   * Where the "Add to chat" button sits and what it would quote, or null when
   * there is no selection in the preview worth offering.
   */
  const [selection, setSelection] = useState<{
    left: number;
    top: number;
    quote: string;
  } | null>(null);
  /** Path of the route that serves images, once the server has told us. */
  const [assetRoute, setAssetRoute] = useState<string | null>(null);
  /** The directory a rooted file's path is relative to, once the server has said. */
  const [documentRoot, setDocumentRoot] = useState<string | null>(null);
  /**
   * Whether Discard is one click from throwing the buffer away.
   *
   * Discarding cannot be undone — React replaces the textarea's value, which
   * takes its native undo history with it — so a single stray click next to
   * Save would silently cost someone their paragraph. Arming first makes the
   * second click a decision rather than an accident, without a modal in a
   * header this narrow.
   */
  const [discardArmed, setDiscardArmed] = useState(false);
  const wireSource = useMemo(() => toWireSource(source), [source]);
  const { directory, name } = splitPath(path);
  const dirty = isDirty(state);

  const load = useCallback(() => {
    dispatch({ type: "reload-start" });
    rpc.call("file_read", { path, source: wireSource }).then(
      (result) => {
        dispatch({ type: "load", content: result.content, sha256: result.sha256 });
      },
      (cause: unknown) => {
        dispatch({
          type: "fail",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      },
    );
  }, [rpc, path, wireSource]);

  useEffect(load, [load]);

  // `state` is read at call time rather than closed over, so the Cmd+S
  // handler below can stay registered across renders without going stale.
  const stateRef = useRef(state);
  stateRef.current = state;

  const save = useCallback(
    (force: boolean) => {
      const current = stateRef.current;
      if (!force && !canSave(current)) return;
      const content = current.buffer;
      dispatch({ type: "save-start" });
      rpc
        .call("file_write", {
          path,
          source: wireSource,
          content,
          expectedSha256: expectedSha(current, force),
        })
        .then(
          (result) => {
            if (result.outcome === "conflict") {
              dispatch({ type: "save-conflict" });
              return;
            }
            dispatch({ type: "save-ok", content, sha256: result.sha256 });
          },
          (cause: unknown) => {
            dispatch({
              type: "fail",
              message: cause instanceof Error ? cause.message : String(cause),
            });
          },
        );
    },
    [rpc, path, wireSource],
  );

  // Cmd+S has to work from the textarea and from the preview pane, so it is
  // bound on the document and scoped by containment. The root is focusable
  // and takes focus on mount for exactly this reason: without it, clicking
  // around in the preview leaves focus on <body> and the shortcut looks
  // broken.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "s" || !(event.metaKey || event.ctrlKey)) return;
      const root = rootRef.current;
      if (root === null || !root.contains(document.activeElement)) return;
      event.preventDefault();
      save(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Quitting or reloading bb with unsaved text in a textarea loses it with no
  // trace. bb's own tab close is not a browser navigation and cannot be
  // intercepted, so this covers the cases the browser will let us cover.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    rpc.call("asset_base").then(
      (result) => setAssetRoute(result.routePath),
      // Without the route, images stay as the author wrote them and the
      // rest of the preview is unaffected.
      () => {},
    );
  }, [rpc]);

  useEffect(() => {
    setDocumentRoot(null);
    if (wireSource.kind === "host") return;
    let current = true;
    rpc.call("document_root", { source: wireSource }).then(
      (result) => {
        if (current) setDocumentRoot(result.rootPath);
      },
      // Without the root, links keep bb's message routing and the rest of
      // the preview is unaffected.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [rpc, wireSource]);

  const markdownDocument = useMemo(
    () => buildMarkdownDocument(path, wireSource, documentRoot),
    [path, wireSource, documentRoot],
  );

  /**
   * The buffer with every sibling image pointed at the plugin's own route.
   *
   * bb's `Markdown` keeps an <img> only for an absolute http or https src —
   * a relative path resolves against the app origin and returns the SPA's
   * index.html, and a data URL is dropped outright — so a file's own
   * screenshots cannot render until they are rewritten here.
   */
  const previewContent = useMemo(() => {
    if (assetRoute === null) return state.buffer;
    const refs = findImageRefs(state.buffer);
    const rewritten = new Map<string, string>();
    for (const ref of refs) {
      if (!isSiblingRef(ref.url) || rewritten.has(ref.url)) continue;
      const resolved = resolveSibling(path, ref.url);
      if (resolved === null || imageMimeType(resolved) === null) continue;
      rewritten.set(
        ref.url,
        buildAssetUrl(window.location.origin, assetRoute, resolved, wireSource),
      );
    }
    if (rewritten.size === 0) return state.buffer;
    return replaceImageUrls(state.buffer, refs, rewritten);
  }, [state.buffer, assetRoute, path, wireSource]);

  // Nothing to discard, or a conflict banner offering its own reload: either
  // way the armed state is stale and should not greet the next edit.
  useEffect(() => {
    if (!dirty || state.status === "conflict") setDiscardArmed(false);
  }, [dirty, state.status]);

  useEffect(() => {
    if (!discardArmed) return;
    const timer = window.setTimeout(() => setDiscardArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [discardArmed]);

  /**
   * Track what is selected in the preview, so the button can be offered.
   *
   * Placement waits for the pointer to come up. `selectionchange` fires on
   * every pixel of a drag, and a button re-anchored under the moving cursor
   * would swallow the mouseup that finished the selection. Clearing does not
   * wait, because a selection that has gone away should not keep a button
   * pointing at it.
   */
  useEffect(() => {
    if (view !== "preview") {
      setSelection(null);
      return;
    }
    let dragging = false;

    const measure = () => {
      const pane = previewRef.current;
      const current = window.getSelection();
      if (
        pane === null ||
        current === null ||
        current.isCollapsed ||
        current.rangeCount === 0
      ) {
        return null;
      }
      const range = current.getRangeAt(0);
      // Both ends have to be in the preview. A selection that starts in the
      // rendered file and ends somewhere in bb's own chrome is not a quote
      // from this file, and its bounding box is not in this pane.
      if (!pane.contains(range.startContainer) || !pane.contains(range.endContainer)) {
        return null;
      }
      const quote = quoteForSelection(path, current.toString());
      if (quote === null) return null;
      const rect = range.getBoundingClientRect();
      const paneRect = pane.getBoundingClientRect();
      return {
        ...anchorForSelection({
          selection: { left: rect.left, top: rect.top, bottom: rect.bottom },
          pane: { left: paneRect.left, top: paneRect.top, height: paneRect.height },
          scroll: { left: pane.scrollLeft, top: pane.scrollTop },
          clientWidth: pane.clientWidth,
        }),
        quote,
      };
    };

    const onSelectionChange = () => {
      const next = measure();
      if (next === null) {
        setSelection(null);
        return;
      }
      if (!dragging) setSelection(next);
    };
    const onPointerDown = () => {
      dragging = true;
    };
    const onPointerUp = () => {
      dragging = false;
      setSelection(measure());
    };

    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointerup", onPointerUp);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [view, path]);

  /**
   * Hand the selection to the composer and collapse it.
   *
   * Collapsing is what retires the button: leaving the range in place would
   * have the next pointerup re-offer a quote that has already been added.
   */
  const addToChat = useCallback(() => {
    if (selection === null) return;
    composer.addQuote(selection.quote);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, [composer, selection]);

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
              onClick={() => {
                if (!discardArmed) {
                  setDiscardArmed(true);
                  return;
                }
                setDiscardArmed(false);
                dispatch({ type: "discard" });
              }}
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
          onClick={load}
          disabled={state.status === "loading" || state.status === "saving"}
        >
          <Icon name="RotateCcw" className="size-4" />
        </Button>

        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
          <SegmentButton
            active={view === "preview"}
            onClick={() => setView("preview")}
            icon="Eye"
            label="Preview"
          />
          <SegmentButton
            active={view === "raw"}
            onClick={() => setView("raw")}
            icon="Code"
            label="Raw"
          />
        </div>

        <Button
          size="sm"
          className="h-7 shrink-0"
          onClick={() => save(false)}
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
          <Button size="sm" variant="outline" className="h-7" onClick={load}>
            Reload, discard mine
          </Button>
          <Button size="sm" variant="destructive" className="h-7" onClick={() => save(true)}>
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
            <AddToChatButton anchor={selection} onAdd={addToChat} />
          )}
        </div>
      ) : (
        <textarea
          value={state.buffer}
          onChange={(event) => dispatch({ type: "edit", content: event.target.value })}
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

export default definePluginApp((app) => {
  app.slots.fileOpener({
    id: "markdown-editor",
    title: "Markdown editor",
    // Shared with the diff-header pencil, which must never offer to edit a
    // file this opener would not claim.
    extensions: [...EDITABLE_EXTENSIONS],
    component: MarkdownEditorTab,
  });

  // The pencil has no React slot to live in: bb owns the diff card header, and
  // the icon group it belongs beside is internal to bb. Decorating existing
  // app-shell DOM is what content scripts are for.
  app.contentScripts.register({
    id: "markdown-editor-diff-pencil",
    mount({ signal }) {
      const engine = startEngine({
        signal,
        doc: document,
        defer: (run) => {
          const frame = window.requestAnimationFrame(run);
          return () => window.cancelAnimationFrame(frame);
        },
        warn: (cause) => {
          console.warn("[markdown-editor]", cause);
        },
      });
      return () => {
        engine.dispose();
      };
    },
  });
});
