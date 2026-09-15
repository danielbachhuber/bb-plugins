// bb-plugin-diff-comment — frontend entry.
//
// Two surfaces. A content script decorates bb's own diff with comment rows,
// because the diff's line DOM is host-owned: `experimental_diffRenderer` would
// replace bb's renderer wholesale, and replacing it means owning a diff view
// that then drifts from bb's. Decorating what bb rendered keeps this plugin's
// comments and bb's diff the same diff. A thread panel lists the same comments
// for reading and resolving.
//
// The wiring lives here; the behaviour lives in diff/ and comment/ so it can
// be tested under jsdom. See diff/dom.ts for every DOM assumption in one
// place, and diff/engine.ts for the loop.
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { CommentCard, CommentComposer } from "@/comment/cards";
import { CommentPanel } from "@/comment/panel";
import type { Comment, CommentState } from "@/comment/types";
import { OVERLAY_CSS } from "@/diff/style";
import { startEngine, type Draft, type Engine } from "@/diff/engine";
import type { rpcContract } from "./server";

type RpcMethod = keyof typeof rpcContract;

/**
 * A content script gets no `useRpc` — that is a React hook and this is not a
 * component — so it calls the plugin's own route directly. The route is
 * same-origin and the app shell is already authenticated for it.
 */
async function callRpc<Result>(
  pluginId: string,
  method: string,
  input: unknown,
): Promise<Result> {
  const response = await fetch(
    `/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/${encodeURIComponent(method as RpcMethod)}`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body: unknown = await response.json().catch(() => null);
  const envelope = body as { ok?: boolean; result?: Result; error?: { message?: string } };
  if (!response.ok || envelope?.ok !== true || envelope.result === undefined) {
    throw new Error(envelope?.error?.message ?? `${method} failed (${response.status})`);
  }
  return envelope.result;
}

/**
 * The stylesheet for the parts that live inside the shadow root — only the
 * hover affordance. Everything else is projected out through a slot and picks
 * up bb's own styles, so this stays small on purpose.
 */
let sheet: CSSStyleSheet | null = null;
function overlaySheet(): CSSStyleSheet {
  if (sheet === null) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(OVERLAY_CSS);
  }
  return sheet;
}

/** Give one diff's shadow root the overlay stylesheet, once. */
function adoptSheet(host: HTMLElement): void {
  const root = host.shadowRoot;
  if (root === null || root.adoptedStyleSheets.includes(overlaySheet())) return;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, overlaySheet()];
}

/** Take it back out again, so a reload does not stack a sheet per generation. */
function dropSheet(doc: Document): void {
  for (const host of Array.from(doc.querySelectorAll("diffs-container"))) {
    const root = host.shadowRoot;
    if (root === null) continue;
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
      (candidate) => candidate !== overlaySheet(),
    );
  }
}

/**
 * The text selected inside one diff.
 *
 * A selection made inside a shadow root is invisible to
 * `document.getSelection()` in the way that matters — Chromium reports the
 * host element as the anchor — so the scoped `ShadowRoot.getSelection()` is
 * used where it exists. The document fallback is guarded by a containment
 * check, or selecting a sentence in the chat and then commenting on a line
 * would quote that unrelated text into the comment.
 */
function selectionInside(host: HTMLElement): string {
  const root = host.shadowRoot as
    | (ShadowRoot & { getSelection?: () => Selection | null })
    | null;

  const scoped = root?.getSelection?.();
  if (scoped !== undefined && scoped !== null) return scoped.toString();

  const selection = document.getSelection();
  if (selection === null || selection.isCollapsed) return "";
  const anchor = selection.anchorNode;
  if (anchor !== null && anchor !== host && !host.contains(anchor)) return "";
  return selection.toString();
}

function mount(pluginId: string, signal: AbortSignal): () => void {
  /** One React root per light-DOM holder, so each card unmounts cleanly. */
  const roots = new Map<HTMLElement, Root>();

  const rootFor = (holder: HTMLElement): Root => {
    const existing = roots.get(holder);
    if (existing !== undefined) return existing;
    const created = createRoot(holder);
    roots.set(holder, created);
    return created;
  };

  /**
   * Render into a holder, and make a failure visible rather than silent. A
   * card that throws would otherwise leave an empty annotation row wedged in
   * the diff with nothing to explain it, which is the hardest kind of bug to
   * report from a screenshot.
   */
  const renderInto = (holder: HTMLElement, element: ReactNode) => {
    try {
      rootFor(holder).render(element);
    } catch (cause) {
      console.warn("[diff-comment] failed to render", cause);
      holder.textContent = `Diff Comment failed to render: ${
        cause instanceof Error ? cause.message : String(cause)
      }`;
    }
  };

  let engine: Engine | null = null;
  const rpc = <Result,>(method: string, input: unknown) =>
    callRpc<Result>(pluginId, method, input);

  const write = (method: string, input: unknown) => {
    rpc(method, input).then(
      () => engine?.refresh(),
      (cause: unknown) => {
        console.warn("[diff-comment]", cause);
        engine?.refresh();
      },
    );
  };

  engine = startEngine({
    rpc,
    doc: document,
    pathname: () => window.location.pathname,
    defer: (run) => {
      const frame = window.requestAnimationFrame(run);
      return () => window.cancelAnimationFrame(frame);
    },
    warn: (cause) => {
      console.warn("[diff-comment]", cause);
    },
    signal,

    mountCard: (holder, comment: Comment) => {
      renderInto(holder, (
        <CommentCard
          comment={comment}
          onSetState={(state: CommentState) =>
            write("comments_set_state", { threadId: comment.threadId, id: comment.id, state })
          }
          onEdit={(body: string) =>
            write("comments_edit", { threadId: comment.threadId, id: comment.id, body })
          }
          onRemove={() =>
            write("comments_remove", { threadId: comment.threadId, id: comment.id })
          }
        />
      ));
    },

    mountComposer: (holder, draft: Draft) => {
      const threadId = /\/threads\/([^/?#]+)/.exec(window.location.pathname)?.[1];
      renderInto(holder, (
        <CommentComposer
          location={`${draft.path}:${draft.line}${draft.side === "old" ? " (old)" : ""}`}
          initialBody={draft.body}
          onCancel={() => engine?.refresh()}
          onSave={(body) => {
            if (threadId === undefined) return;
            write("comments_add", {
              threadId: decodeURIComponent(threadId),
              path: draft.path,
              side: draft.side,
              line: draft.line,
              anchor: draft.anchor,
              body,
            });
          }}
        />
      ));
    },

    prepareHost: adoptSheet,

    readSelection: selectionInside,

    unmountCard: (holder) => {
      const root = roots.get(holder);
      if (root === undefined) return;
      roots.delete(holder);
      // React forbids unmounting during its own render pass, and the engine
      // may be mid-pass here, so this is deferred by a task rather than run
      // inline.
      setTimeout(() => root.unmount(), 0);
    },
  });

  // Another window may have commented, and an agent's `bb diff-comment reply`
  // does not reach this window at all. Realtime is React-side only, so this
  // settles for refetching when the window comes back to the front — the same
  // trade bb-plugin-diff-viewed makes.
  const onFocus = () => engine?.refresh();
  window.addEventListener("focus", onFocus);

  return () => {
    window.removeEventListener("focus", onFocus);
    dropSheet(document);
    engine?.dispose();
    for (const root of roots.values()) {
      setTimeout(() => root.unmount(), 0);
    }
    roots.clear();
  };
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "diff-comment-overlay",
    mount({ pluginId, signal }) {
      return mount(pluginId, signal);
    },
  });

  app.slots.threadPanelAction({
    id: "comments",
    title: "Diff comments",
    icon: "MessageSquare",
    component: ({ threadId }) => <CommentPanel threadId={threadId} />,
  });
});
