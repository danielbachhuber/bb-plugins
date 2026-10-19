// Inline annotations: a card under the line each note explains, and a
// numbered list of every note at the top of the Super Diff.
//
// The cards go into bb's diff the way Diff Comment's do: Pierre renders each
// file into a `<diffs-container>` with an open shadow root, where a gutter
// stack and a content stack line up row by row (`grid-row: span N` subgrids).
// A note adds one row to BOTH stacks at the same index and bumps both spans;
// in split view the other column gets a blank row so the halves stay level.
// The row holds a named <slot>, and the card itself lives in the light DOM
// under the host, where bb's stylesheet reaches it.
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export type Note = {
  id: string;
  path: string;
  /** Text from the line the note explains. It finds the line, so a note survives edits above it. */
  anchor: string;
  title: string;
  body: string;
};

/** A note with its place in the diff: `n` is its number in reading order, `line` its new-side line. */
export type PlacedNote = Note & { n: number; line: number | null };

const NOTE_ATTR = "data-super-diff-note";
const OLD_SIDE_TYPES = new Set(["deletion", "change-deletion"]);

/** The new-side line number of the first added or context line containing `anchor`. */
export function lineForAnchor(patch: string, anchor: string): number | null {
  let line = 0;
  let inHunk = false;
  for (const raw of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || raw.startsWith("-") || raw.startsWith("\\")) continue;
    if (raw.startsWith("+") || raw.startsWith(" ")) {
      if (raw.slice(1).includes(anchor)) return line;
      line++;
    }
  }
  return null;
}

/** Numbers notes in reading order: by the order files appear in the Super Diff, then by line. */
export function placeNotes(notes: Note[], fileOrder: readonly string[], patches: Map<string, string>): PlacedNote[] {
  return notes
    .map((note) => {
      const patch = patches.get(note.path);
      return { ...note, line: patch === undefined ? null : lineForAnchor(patch, note.anchor) };
    })
    .sort(
      (a, b) =>
        fileOrder.indexOf(a.path) - fileOrder.indexOf(b.path) ||
        (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER),
    )
    .map((note, index) => ({ ...note, n: index + 1 }));
}

function where(note: PlacedNote): string {
  const name = note.path.split("/").pop() ?? note.path;
  return note.line === null ? name : `${name}:${note.line}`;
}

function Badge({ n }: { n: number }) {
  return (
    <span
      className="shrink-0 text-center tabular-nums"
      style={{
        width: 16,
        height: 16,
        borderRadius: 9999,
        background: "var(--foreground)",
        color: "var(--background)",
        font: "600 10px/16px system-ui",
      }}
    >
      {n}
    </span>
  );
}

function Sparkles() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    </svg>
  );
}

/** `code` spans only; the agent's notes are short prose. */
export function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={index} className="font-mono">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function NoteCard({ note, highlighted }: { note: PlacedNote; highlighted: boolean }) {
  return (
    <div
      className="mx-2 my-2 rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground"
      style={{
        fontFamily: "var(--font-sans, ui-sans-serif, system-ui)",
        whiteSpace: "normal",
        outline: highlighted ? "2px solid var(--foreground)" : undefined,
        outlineOffset: 1,
      }}
    >
      <div className="mb-1 flex items-center gap-1.5 font-medium">
        <Badge n={note.n} />
        <Sparkles />
        <span>{note.title}</span>
      </div>
      <div className="text-muted-foreground" style={{ lineHeight: 1.45 }}>
        <Prose text={note.body} />
      </div>
    </div>
  );
}

/** The numbered list at the top of the Super Diff. A note not found in the diff is listed, not linked. */
export function NotesBox({ notes, onJump }: { notes: PlacedNote[]; onJump: (id: string) => void }) {
  if (notes.length === 0) return null;
  return (
    <div className="mb-4 rounded-lg border border-border bg-background px-2 py-2 text-xs">
      <div className="mb-1 flex items-center gap-1.5 px-1.5 font-medium text-foreground">
        <Sparkles />
        {notes.length} {notes.length === 1 ? "annotation" : "annotations"}
      </div>
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          disabled={note.line === null}
          onClick={() => onJump(note.id)}
          className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-state-hover disabled:opacity-60"
        >
          <Badge n={note.n} />
          <span className="min-w-0 flex-1 truncate text-foreground">{note.title}</span>
          <span className="shrink-0 font-mono text-muted-foreground" style={{ fontSize: 11 }}>
            {note.line === null ? `${where(note)} · not in this diff` : where(note)}
          </span>
        </button>
      ))}
    </div>
  );
}

function childWith(parent: Element, attr: string): HTMLElement | null {
  for (const child of Array.from(parent.children)) {
    if (child instanceof HTMLElement && child.hasAttribute(attr)) return child;
  }
  return null;
}

function bumpSpan(stack: HTMLElement): void {
  const style = stack.getAttribute("style") ?? "";
  const match = /grid-row:\s*span\s+(\d+)/.exec(style);
  if (match) stack.setAttribute("style", style.replace(match[0], `grid-row: span ${Number(match[1]) + 1}`));
}

function slotName(id: string): string {
  return `super-diff-note-${id}`;
}

/** Adds the note's row under `line`, once. Pierre re-rendering drops it, and the observer calls this again. */
/** True once the note's row is in the diff; false while the line is not drawn yet. */
function ensureRow(root: ShadowRoot, line: number, id: string): boolean {
  if (root.querySelector(`[${NOTE_ATTR}="${id}"]`) !== null) return true;
  const columns = Array.from(root.querySelectorAll<HTMLElement>("[data-code]"));
  const column = columns.find((c) => c.hasAttribute("data-additions")) ?? columns.find((c) => c.hasAttribute("data-unified")) ?? columns[0];
  if (column === undefined) return false;
  const gutter = childWith(column, "data-gutter");
  const content = childWith(column, "data-content");
  if (gutter === null || content === null) return false;
  const rows = Array.from(content.children);
  const cells = Array.from(gutter.children);
  if (rows.length !== cells.length) return false;
  const index = rows.findIndex(
    (row) => row.getAttribute("data-line") === String(line) && !OLD_SIDE_TYPES.has(row.getAttribute("data-line-type") ?? ""),
  );
  if (index === -1) return false;

  const row = document.createElement("div");
  row.setAttribute("data-line-annotation", "super-diff");
  row.setAttribute(NOTE_ATTR, id);
  const inner = document.createElement("div");
  inner.setAttribute("data-annotation-content", "");
  const slot = document.createElement("slot");
  slot.name = slotName(id);
  inner.append(slot);
  row.append(inner);
  const cell = document.createElement("div");
  cell.setAttribute("data-gutter-buffer", "annotation");
  cell.setAttribute("data-line-type", rows[index]!.getAttribute("data-line-type") ?? "context");
  cell.setAttribute(NOTE_ATTR, id);
  rows[index]!.after(row);
  cells[index]!.after(cell);
  bumpSpan(gutter);
  bumpSpan(content);

  // Split view: a blank row in the other half keeps the two sides level.
  for (const other of columns) {
    if (other === column) continue;
    const otherGutter = childWith(other, "data-gutter");
    const otherContent = childWith(other, "data-content");
    const anchorRow = otherContent?.children[index];
    const anchorCell = otherGutter?.children[index];
    if (!otherGutter || !otherContent || !anchorRow || !anchorCell) continue;
    const spacer = document.createElement("div");
    spacer.setAttribute("data-line-annotation", "super-diff");
    spacer.setAttribute(NOTE_ATTR, `${id}-spacer`);
    const spacerCell = document.createElement("div");
    spacerCell.setAttribute("data-gutter-buffer", "annotation");
    spacerCell.setAttribute("data-line-type", "context");
    spacerCell.setAttribute(NOTE_ATTR, `${id}-spacer`);
    anchorRow.after(spacer);
    anchorCell.after(spacerCell);
    bumpSpan(otherGutter);
    bumpSpan(otherContent);
  }
  return true;
}

/**
 * Keeps one file's note rows in its diff and renders each card into its slot.
 * Watches the card for a new `<diffs-container>` (collapse and expand make
 * one) and the shadow root for Pierre re-rendering its rows.
 */
export function NoteRows({
  containerRef,
  notes,
  highlightId,
}: {
  containerRef: RefObject<HTMLElement | null>;
  notes: PlacedNote[];
  highlightId: string | null;
}): ReactNode {
  const [holders, setHolders] = useState<Map<string, HTMLElement>>(new Map());
  const key = notes.map((note) => `${note.id}@${note.line}`).join("|");

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    let host: HTMLElement | null = null;
    let shadowObserver: MutationObserver | null = null;

    // bb draws a diff's lines a moment after its container appears, and its
    // shadow root may not be there yet, so placement tries again for a while.
    let tries = 0;
    let timer: number | undefined;
    const retry = () => {
      if (timer !== undefined || tries >= 40) return;
      tries++;
      timer = window.setTimeout(() => {
        timer = undefined;
        ensure();
      }, 250);
    };

    const ensure = () => {
      const current = container.querySelector<HTMLElement>("diffs-container");
      if (current !== host) {
        shadowObserver?.disconnect();
        shadowObserver = null;
        host = current;
        if (host?.shadowRoot) {
          shadowObserver = new MutationObserver(ensure);
          shadowObserver.observe(host.shadowRoot, { childList: true, subtree: true });
        }
      }
      const root = host?.shadowRoot;
      if (host === null || !root) {
        retry();
        return;
      }
      let missing = false;
      const next = new Map<string, HTMLElement>();
      for (const note of notes) {
        if (note.line === null) continue;
        let holder = Array.from(host.children).find(
          (child): child is HTMLElement => child instanceof HTMLElement && child.getAttribute("slot") === slotName(note.id),
        );
        if (holder === undefined) {
          holder = document.createElement("div");
          holder.slot = slotName(note.id);
          holder.setAttribute(NOTE_ATTR, note.id);
          host.append(holder);
        }
        next.set(note.id, holder);
        if (!ensureRow(root, note.line, note.id)) missing = true;
      }
      if (missing) retry();
      setHolders((previous) =>
        previous.size === next.size && [...next].every(([id, el]) => previous.get(id) === el) ? previous : next,
      );
    };

    const lightObserver = new MutationObserver(ensure);
    lightObserver.observe(container, { childList: true, subtree: true });
    ensure();
    return () => {
      lightObserver.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      shadowObserver?.disconnect();
    };
    // `key` stands in for `notes`, which is rebuilt on every render.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [containerRef, key]);

  return (
    <>
      {notes.map((note) => {
        const holder = holders.get(note.id);
        return holder ? createPortal(<NoteCard note={note} highlighted={highlightId === note.id} />, holder, note.id) : null;
      })}
    </>
  );
}

/** Scrolls the Super Diff list so a note's card sits near the top. */
export function scrollToNote(scroller: HTMLElement, id: string): boolean {
  const holder = scroller.querySelector<HTMLElement>(`[slot="${slotName(id)}"]`);
  if (holder === null) return false;
  scroller.scrollTop += holder.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 90;
  return true;
}
