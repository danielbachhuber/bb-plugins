// bb-plugin-markdown-editor — frontend entry.
//
// Registers one `fileOpener`, which means this component becomes the entire
// body of a markdown file's tab. bb's own preview is still reachable through
// the tab's "Open with" menu; we do not render it here, because delegating to
// it would put its Preview/Raw control underneath ours and leave two
// segmented controls arguing about which view is showing.
//
// There is no filesystem API on this side, so every read and write is an RPC
// to server.ts. The state rules live in editor/save.ts; this file is the
// wiring, the keyboard, and the chrome.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Markdown,
  definePluginApp,
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
  buildAssetUrl,
  findImageRefs,
  imageMimeType,
  isSiblingRef,
  replaceImageUrls,
  resolveSibling,
} from "./editor/images";
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

function MarkdownEditorTab({ path, source }: PluginFileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [state, dispatch] = useReducer(reduce, initialState);
  const [view, setView] = useState<View>("preview");
  const rootRef = useRef<HTMLDivElement>(null);
  /** Path of the route that serves images, once the server has told us. */
  const [assetRoute, setAssetRoute] = useState<string | null>(null);
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

        <span
          className={cn(
            "shrink-0 text-xs",
            dirty ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {status}
        </span>

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

        {dirty && state.status !== "conflict" ? (
          <Button
            variant={discardArmed ? "destructive" : "ghost"}
            size="sm"
            className="h-7 shrink-0"
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
        <div className="min-h-0 flex-1 overflow-y-auto bg-background">
          <div className="mx-auto box-border w-full max-w-3xl px-4 py-4">
            <Markdown content={previewContent} />
          </div>
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
    extensions: ["md", "mdx", "markdown", "txt"],
    component: MarkdownEditorTab,
  });
});
