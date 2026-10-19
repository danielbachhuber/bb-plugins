// Replaces the Diff tab's virtualized file list with Super Diff's own
// grouped list, built from bb's diff API, while keeping the card DOM shape Diff
// Viewed and Diff Comment look for. The grouping, explanations, and notes are
// written by the thread's agent (Generate asks it) and stored by the server.
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { definePluginApp, experimental_Diff as Diff } from "@get-bb/plugin-sdk/app";
import { NoteRows, NotesBox, placeNotes, scrollToNote, type PlacedNote } from "./annotations";
import { SuperDiffRow, type Loaded, type ThreadState } from "./row";
import {
  GENERATED_TITLE,
  UNGROUPED_TITLE,
  isPlacedByRule,
  type DiffFile as FileEntry,
  type DiffTarget as Target,
  type StoredSuperDiff,
} from "./grouping";

const REPLACED_ATTR = "data-super-diff-replaced";
const HOST_ATTR = "data-super-diff-host";
const ROW_ATTR = "data-super-diff-row";
const TOOLBAR = '[data-testid="git-diff-toolbar-actions"]';
const SELECTOR_SLOT = '[data-testid="git-diff-toolbar-selector-slot"]';
const SUMMARY = '[data-testid="git-diff-toolbar-summary"]';
const TIMELINE = "[data-timeline-file-diff]";
const PATCH_BATCH = 50;
const POLL_MS = 2000;

const STYLE = `[${REPLACED_ATTR}] { display: none !important; }`;

type Group = { kind: "concern" | "generated" | "ungrouped"; title: string; explanation: string; files: FileEntry[] };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${path} failed (${response.status})`);
  return (await response.json()) as T;
}

/** The plugin's own RPC route; a content script has no `useRpc`. */
async function callRpc<T>(pluginId: string, method: string, input: unknown): Promise<T> {
  const response = await fetch(`/api/v1/plugins/${encodeURIComponent(pluginId)}/rpc/${encodeURIComponent(method)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; result?: T } | null;
  if (!response.ok || body?.ok !== true || body.result === undefined) throw new Error(`${method} failed (${response.status})`);
  return body.result;
}

function threadIdFromPath(pathname: string): string | null {
  const match = /\/threads\/([^/?#]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** The toolbar's diff picker label: "All changes", "Committed changes", ... */
function readSelection(toolbarRoot: ParentNode): string {
  return toolbarRoot.querySelector(SELECTOR_SLOT)?.textContent?.trim() ?? "";
}

type DiffContext = { environmentId: string; target: Target };

/** The thread's environment and the diff target the picker shows, or why Super Diff can't use it. */
async function resolveContext(threadId: string, selection: string): Promise<DiffContext | string> {
  const thread = await api<{ environmentId: string | null }>(`/threads/${threadId}`);
  if (thread.environmentId === null) return "This thread has no environment to diff.";
  if (/uncommitted/i.test(selection)) return { environmentId: thread.environmentId, target: { type: "uncommitted" } };
  const env = await api<{ mergeBaseBranch: string | null; baseBranch: string | null; defaultBranch: string | null }>(
    `/environments/${thread.environmentId}`,
  );
  const mergeBaseBranch = env.mergeBaseBranch ?? env.baseBranch ?? env.defaultBranch;
  if (mergeBaseBranch === null) return "This environment has no base branch to compare against.";
  if (/committed/i.test(selection)) return { environmentId: thread.environmentId, target: { type: "branch_committed", mergeBaseBranch } };
  if (/all changes/i.test(selection) || selection === "") return { environmentId: thread.environmentId, target: { type: "all", mergeBaseBranch } };
  return "The prototype can't group a single commit yet. Pick All changes.";
}

async function loadDiff({ environmentId, target }: DiffContext): Promise<Loaded> {
  const query =
    target.type === "uncommitted"
      ? "target=uncommitted"
      : `target=${target.type}&mergeBaseBranch=${encodeURIComponent(target.mergeBaseBranch)}`;
  const listing = await api<{ files: FileEntry[] }>(`/environments/${environmentId}/diff/files?${query}`);
  const patches = new Map<string, string>();
  const loadable = listing.files.filter((file) => file.loadMode !== "too_large").map((file) => file.path);
  for (let start = 0; start < loadable.length; start += PATCH_BATCH) {
    const result = await api<{ patches: { path: string; patch: string }[] }>(`/environments/${environmentId}/diff/patch`, {
      method: "POST",
      body: JSON.stringify({ target, paths: loadable.slice(start, start + PATCH_BATCH) }),
    });
    for (const entry of result.patches) patches.set(entry.path, entry.patch);
  }
  return { files: listing.files, patches, target };
}

/**
 * The agent's concerns, in its order, holding the files still on the diff;
 * then Generated files; then any file no concern holds, so every file on the
 * diff is shown exactly once.
 */
function buildGroups(stored: StoredSuperDiff, files: FileEntry[]): Group[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const shown = new Set<string>();
  const groups: Group[] = [];
  for (const concern of stored.submission.concerns) {
    const present = concern.files.map((path) => byPath.get(path)).filter((file): file is FileEntry => file !== undefined && !shown.has(file.path));
    present.forEach((file) => shown.add(file.path));
    if (present.length > 0) groups.push({ kind: "concern", title: concern.title, explanation: concern.explanation, files: present });
  }
  const generated = files.filter((file) => !shown.has(file.path) && isPlacedByRule(file));
  generated.forEach((file) => shown.add(file.path));
  if (generated.length > 0) {
    groups.push({ kind: "generated", title: GENERATED_TITLE, explanation: "Lockfiles, snapshots, binary files, and files too large to show. Placed by rule.", files: generated });
  }
  const ungrouped = files.filter((file) => !shown.has(file.path));
  if (ungrouped.length > 0) {
    groups.push({ kind: "ungrouped", title: UNGROUPED_TITLE, explanation: "Changed since the Super Diff was generated.", files: ungrouped });
  }
  return groups;
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <pre className="px-3 py-2 text-xs text-destructive">Super Diff: {this.state.error.message}</pre>;
    }
    return this.props.children;
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0 transition-transform duration-150"
      style={{ transform: open ? "rotate(90deg)" : undefined }}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * One file, in the DOM shape of bb's DiffFileCard: Diff Viewed resolves a card
 * from a `justify-between` row of exactly two children whose first child's
 * first child is the `aria-expanded` toggle, and Diff Comment walks up from
 * `diffs-container` to the nearest such toggle for the path.
 */
function FileCard({
  file,
  index,
  patch,
  split,
  notes,
  highlightId,
}: {
  file: FileEntry;
  index: number;
  patch: string | undefined;
  split: boolean;
  notes: PlacedNote[];
  highlightId: string | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Jumping to a note in a collapsed file opens the file first.
  useEffect(() => {
    if (highlightId !== null && notes.some((note) => note.id === highlightId)) setCollapsed(false);
  }, [highlightId, notes]);
  const label = file.previousPath && file.previousPath !== file.path ? `${file.previousPath} -> ${file.path}` : file.path;
  return (
    <div data-index={index} style={{ paddingBottom: 8 }}>
      <div className="overflow-clip rounded-lg border border-border bg-background">
        <div
          className={`sticky top-0 z-30 -mt-px border-t border-border rounded-lg bg-background py-1.5 pl-2 pr-3 text-xs font-medium text-foreground ${collapsed ? "" : "rounded-b-none"}`}
        >
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center">
              <button
                type="button"
                className="inline-flex w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setCollapsed((value) => !value)}
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`}
                aria-expanded={!collapsed}
              >
                <Chevron open={!collapsed} />
              </button>
              <span className="flex min-w-0 items-center gap-1.5 pl-[1ch]">
                <span className="truncate font-mono font-medium text-foreground">{label}</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="whitespace-nowrap text-xs">
                <span className="text-diff-added">+{file.additions}</span>{" "}
                <span className="text-diff-removed">-{file.deletions}</span>
              </span>
            </span>
          </div>
        </div>
        {collapsed ? null : patch !== undefined ? (
          <Boundary>
            <div ref={bodyRef}>
              <Diff patch={patch} path={file.path} view={split ? "split" : "unified"} />
              <NoteRows containerRef={bodyRef} notes={notes} highlightId={highlightId} />
            </div>
          </Boundary>
        ) : (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            {file.binary ? "Binary file." : file.loadMode === "too_large" ? "Too large to show here." : "Loading…"}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupedList({ data, stored, split }: { data: Loaded; stored: StoredSuperDiff; split: boolean }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const groups = useMemo(() => buildGroups(stored, data.files), [stored, data]);
  const notes = useMemo(() => {
    const order = groups.flatMap((group) => group.files.map((file) => file.path));
    const fromAgent = stored.submission.annotations.map((note, index) => ({ ...note, id: `note-${index}` }));
    return placeNotes(fromAgent, order, data.patches);
  }, [stored, data, groups]);

  const jump = (id: string) => {
    setHighlightId(id);
    const scroller = wrapperRef.current?.closest<HTMLElement>(`[${HOST_ATTR}]`);
    if (!scroller) return;
    // A collapsed file opens first, so its card may take a few frames to appear.
    let tries = 0;
    const attempt = () => {
      if (!scrollToNote(scroller, id) && tries++ < 20) window.requestAnimationFrame(attempt);
    };
    attempt();
  };
  useEffect(() => {
    if (highlightId === null) return;
    const timer = window.setTimeout(() => setHighlightId(null), 1600);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  let index = 0;
  let concernNumber = 0;
  return (
    <div ref={wrapperRef}>
      <NotesBox notes={notes} onJump={jump} />
      <FilesProps files={data.files} target={data.target}>
        {groups.map((group) => (
          <section key={`${group.kind}:${group.title}`} className="mb-4">
            <header className="px-1 pb-2 pt-1">
              <h3 className="text-sm font-semibold text-foreground">
                {group.kind === "concern" ? (
                  <span className="text-muted-foreground tabular-nums" style={{ marginRight: 8 }}>{++concernNumber}</span>
                ) : null}
                {group.title}
                <span className="text-xs font-normal text-muted-foreground" style={{ marginLeft: 8 }}>
                  {group.files.length} {group.files.length === 1 ? "file" : "files"}
                </span>
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{group.explanation}</p>
            </header>
            {group.files.map((file) => (
              <FileCard
                key={file.path}
                file={file}
                index={index++}
                patch={data.patches.get(file.path)}
                split={split}
                notes={notes.filter((note) => note.path === file.path)}
                highlightId={highlightId}
              />
            ))}
          </section>
        ))}
      </FilesProps>
    </div>
  );
}

/**
 * Diff Viewed counts progress from a `files` (and `target`) prop it finds by
 * walking React fibers up from a `[data-index]` row, which is where bb's own
 * DiffFilesPanel keeps them. Carrying the same props here keeps that working.
 */
function FilesProps({ children }: { files: FileEntry[]; target: Target; children: ReactNode }) {
  return <div>{children}</div>;
}

/**
 * bb's list scrolls inside `div.overflow-y-auto > div.relative.w-full`, with
 * no attribute of its own. Walk up from the toolbar to the first ancestor that
 * holds one, outside the timeline.
 */
function findPanel(doc: Document): { toolbar: HTMLElement; list: HTMLElement; root: HTMLElement } | null {
  const toolbar = doc.querySelector<HTMLElement>(TOOLBAR);
  if (toolbar === null) return null;
  let node: HTMLElement | null = toolbar.parentElement;
  while (node !== null) {
    for (const candidate of node.querySelectorAll<HTMLElement>("div.overflow-y-auto")) {
      if (candidate.hasAttribute(HOST_ATTR) || candidate.closest(TIMELINE) !== null) continue;
      const inner = candidate.firstElementChild;
      if (inner instanceof HTMLElement && inner.classList.contains("relative") && inner.classList.contains("w-full")) {
        return { toolbar, list: candidate, root: node };
      }
    }
    node = node.parentElement;
  }
  return null;
}

function mount(pluginId: string, signal: AbortSignal): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-super-diff-style", "");
  style.textContent = STYLE;
  document.head.append(style);

  /** Keyed by thread and picker label, so each diff target has its own Super Diff. */
  const states = new Map<string, ThreadState>();
  const contexts = new Map<string, Promise<DiffContext | string>>();
  const keyOf = (threadId: string, selection: string) => `${threadId}|${selection}`;
  const contextOf = (threadId: string, selection: string) => {
    const key = keyOf(threadId, selection);
    let context = contexts.get(key);
    if (context === undefined) {
      context = resolveContext(threadId, selection);
      contexts.set(key, context);
    }
    return context;
  };

  let listHost: HTMLDivElement | null = null;
  let listRoot: Root | null = null;
  let replaced: HTMLElement | null = null;
  let rowHost: HTMLDivElement | null = null;
  let rowRoot: Root | null = null;
  let frame = 0;

  const unmountLater = (root: Root | null) => {
    if (root !== null) setTimeout(() => root.unmount(), 0);
  };

  /** Puts bb's own list back. */
  const showOriginal = () => {
    replaced?.removeAttribute(REPLACED_ATTR);
    replaced = null;
    unmountLater(listRoot);
    listRoot = null;
    listHost?.remove();
    listHost = null;
  };

  const removeRow = () => {
    unmountLater(rowRoot);
    rowRoot = null;
    rowHost?.remove();
    rowHost = null;
  };

  const fail = (key: string, cause: unknown) => {
    states.set(key, { phase: "error", message: cause instanceof Error ? cause.message : String(cause) });
    schedule();
  };

  /** Asks the server for a stored Super Diff, once per thread and target. */
  const check = async (threadId: string, selection: string) => {
    const key = keyOf(threadId, selection);
    states.set(key, { phase: "checking" });
    try {
      const context = await contextOf(threadId, selection);
      if (typeof context === "string") return fail(key, context);
      const result = await callRpc<{ stored: string | null; requestedAt: string | null }>(pluginId, "superdiff_get", { threadId, target: context.target });
      const stored = result.stored === null ? null : (JSON.parse(result.stored) as StoredSuperDiff);
      // A request newer than what is stored means the agent is still working on it.
      if (result.requestedAt !== null && (stored === null || stored.acceptedAt < result.requestedAt)) {
        states.set(key, { phase: "generating", requestedAt: result.requestedAt });
        void poll(threadId, selection, result.requestedAt);
      } else {
        states.set(key, stored === null ? { phase: "idle" } : { phase: "ready", showing: "original", stored, data: null });
      }
      schedule();
    } catch (cause) {
      fail(key, cause);
    }
  };

  /** Waits for the agent's submission, then shows it. */
  const poll = async (threadId: string, selection: string, requestedAt: string) => {
    const key = keyOf(threadId, selection);
    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      const current = states.get(key);
      if (current?.phase !== "generating" || current.requestedAt !== requestedAt) return;
      try {
        const context = await contextOf(threadId, selection);
        if (typeof context === "string") return fail(key, context);
        const result = await callRpc<{ stored: string | null }>(pluginId, "superdiff_get", { threadId, target: context.target });
        const stored = result.stored === null ? null : (JSON.parse(result.stored) as StoredSuperDiff);
        if (stored !== null && stored.acceptedAt >= requestedAt) {
          const data = await loadDiff(context);
          states.set(key, { phase: "ready", showing: "super", stored, data });
          schedule();
          return;
        }
        schedule(); // keeps "asked N min ago" current
      } catch (cause) {
        return fail(key, cause);
      }
    }
  };

  const generate = async (threadId: string, selection: string) => {
    const key = keyOf(threadId, selection);
    try {
      const context = await contextOf(threadId, selection);
      if (typeof context === "string") return fail(key, context);
      const { requestedAt } = await callRpc<{ requestedAt: string }>(pluginId, "superdiff_generate", { threadId, target: context.target });
      states.set(key, { phase: "generating", requestedAt });
      schedule();
      void poll(threadId, selection, requestedAt);
    } catch (cause) {
      fail(key, cause);
    }
  };

  const show = async (threadId: string, selection: string, showing: "super" | "original") => {
    const key = keyOf(threadId, selection);
    const current = states.get(key);
    if (current?.phase !== "ready") return;
    states.set(key, { ...current, showing });
    schedule();
    if (showing === "super" && current.data === null) {
      try {
        const context = await contextOf(threadId, selection);
        if (typeof context === "string") return fail(key, context);
        const data = await loadDiff(context);
        const latest = states.get(key);
        if (latest?.phase === "ready") states.set(key, { ...latest, data });
        schedule();
      } catch (cause) {
        fail(key, cause);
      }
    }
  };

  const sync = () => {
    frame = 0;
    if (signal.aborted) return;
    const threadId = threadIdFromPath(window.location.pathname);
    const panel = findPanel(document);
    if (threadId === null || panel === null) {
      if (listHost !== null && !listHost.isConnected) showOriginal();
      if (rowHost !== null && !rowHost.isConnected) removeRow();
      return;
    }
    const toolbarRoot = panel.root;
    const layout = toolbarRoot.querySelector<HTMLElement>('[data-testid="git-diff-toolbar-layout"]');
    if (layout === null) return;
    const summaryEl = toolbarRoot.querySelector(SUMMARY);
    const summary = summaryEl?.getAttribute("title") ?? summaryEl?.textContent ?? "";
    const selection = readSelection(toolbarRoot);
    const split =
      toolbarRoot.querySelector('button[aria-label="Split diff view"]')?.getAttribute("aria-pressed") === "true";
    const mode = toolbarRoot.querySelector<HTMLElement>('[aria-label="Diff view mode"]');
    const segmentButton = mode?.querySelector("button");

    if (rowHost === null || !rowHost.isConnected || rowHost.previousElementSibling !== layout) {
      removeRow();
      rowHost = document.createElement("div");
      rowHost.setAttribute(ROW_ATTR, "");
      layout.after(rowHost);
      rowRoot = createRoot(rowHost);
    }
    const key = keyOf(threadId, selection);
    if (!states.has(key)) void check(threadId, selection);
    const state = states.get(key) ?? { phase: "checking" as const };
    const fileCount = Number(/^(\d+) files?/.exec(summary)?.[1] ?? NaN);
    rowRoot?.render(
      <SuperDiffRow
        state={state}
        fileCount={Number.isFinite(fileCount) ? fileCount : null}
        segmentClass={mode?.className ?? ""}
        segmentButtonClass={(segmentButton?.className ?? "").replace(/\bw-7\b/, "").replace(/\bp-0\b/, "px-2.5")}
        onGenerate={() => void generate(threadId, selection)}
        onShow={(showing) => void show(threadId, selection, showing)}
      />,
    );

    if (state.phase !== "ready" || state.showing !== "super" || state.data === null) {
      if (listHost !== null) showOriginal();
      return;
    }
    if (replaced !== panel.list || listHost === null || !listHost.isConnected) {
      showOriginal();
      listHost = document.createElement("div");
      listHost.setAttribute(HOST_ATTR, "");
      listHost.className = "min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-3";
      panel.list.after(listHost);
      panel.list.setAttribute(REPLACED_ATTR, "");
      replaced = panel.list;
      listRoot = createRoot(listHost);
    }
    listRoot?.render(<GroupedList data={state.data} stored={state.stored} split={split} />);
  };

  const schedule = () => {
    if (frame === 0) frame = window.requestAnimationFrame(sync);
  };
  const observer = new MutationObserver((records) => {
    // Ignore churn inside Super Diff's own nodes; bb's re-renders are what matter.
    const ours = (node: Node) =>
      (listHost !== null && listHost.contains(node)) || (rowHost !== null && rowHost.contains(node));
    if (records.every((record) => ours(record.target))) return;
    schedule();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-pressed", "title"],
  });
  // Keeps "generated N min ago" current.
  const clock = window.setInterval(schedule, 30_000);
  schedule();

  return () => {
    observer.disconnect();
    window.clearInterval(clock);
    if (frame !== 0) window.cancelAnimationFrame(frame);
    showOriginal();
    removeRow();
    style.remove();
  };
}

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "super-diff-grouped-list",
    mount({ pluginId, signal }) {
      return mount(pluginId, signal);
    },
  });
});
