// An item's changes: one heading with a Unified / Split toggle (and Edit, when
// a change compares against the item's draft), then one bordered block per
// changed thing, each with its name and line counts. Prose shows as paired
// lines with the changed words marked; code shows in bb's own diff view; a
// lockfile shows the packages whose versions changed, with its raw diff a
// click away. Kept free of RPC so a story can render it with fixture props.
import { useState, type ReactNode } from "react";
import { experimental_Diff as Diff } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import {
  diffWords,
  lockfileKind,
  lockfilePackages,
  manifestFor,
  pairLines,
  patchCounts,
  proseCounts,
  textPatch,
  type Counts,
  type PackageChange,
  type ProseRow,
} from "./changes.js";
import { changeFormat, usesDraftAsAfter, type Change, type Item } from "./schema.js";

export type ChangesMode = "unified" | "split" | "edit";

export interface ChangesBlockProps {
  item: Item;
  /** The item's draft as the user left it, for a change that compares against it. */
  draft: string;
  /** Absent once the item can no longer be sent: Edit goes away. */
  onDraftChange?: (value: string) => void;
  initialMode?: ChangesMode;
  /** Which changes start open, by index, for a story; otherwise each change's `collapsed` decides. */
  initiallyOpen?: number[];
  /** Whether each lockfile starts on its raw diff, for a story. */
  initiallyRaw?: boolean;
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CountsLabel({ counts }: { counts: Counts }) {
  return (
    <>
      <span className="tabular-nums text-success">+{counts.added}</span>
      <span className="tabular-nums text-destructive">−{counts.removed}</span>
    </>
  );
}

/** One line of a prose diff, with the words that changed marked. */
function ProseLine({ row, side }: { row: ProseRow; side?: "before" | "after" }) {
  if (row.text.trim() === "" && row.kind === "same") return <div className="h-2" />;
  if (row.kind === "same") return <div className={side === "before" ? "text-muted-foreground" : undefined}>{row.text}</div>;
  if (row.kind === "added") return <div className="rounded-sm bg-success/15 text-success">{row.text}</div>;
  if (row.kind === "removed") return <div className="text-destructive line-through decoration-destructive/60">{row.text}</div>;
  const pieces = diffWords(row.from!, row.text);
  return (
    <div>
      {pieces.map((piece, i) =>
        piece.kind === "same" ? (
          <span key={i}>{piece.text}</span>
        ) : piece.kind === "added" ? (
          side === "before" ? null : (
            <span key={i} className="rounded-sm bg-success/15 text-success">
              {piece.text}
            </span>
          )
        ) : side === "after" ? null : (
          <span key={i} className="rounded-sm bg-destructive/10 text-destructive line-through">
            {piece.text}
          </span>
        ),
      )}
    </div>
  );
}

function ProseBody({ rows, mode }: { rows: ProseRow[]; mode: "unified" | "split" }) {
  if (mode === "unified") {
    return (
      <div className="flex flex-col gap-1 px-3 py-2 text-[13px] leading-snug text-foreground">
        {rows.map((row, i) => (
          <ProseLine key={i} row={row} />
        ))}
      </div>
    );
  }
  // Side by side: what it was on the left, what it becomes on the right, row for row.
  return (
    <div className="grid grid-cols-2 divide-x divide-border text-[12px] leading-snug text-foreground">
      {(["before", "after"] as const).map((side) => (
        <div key={side} className="flex flex-col gap-1 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{side === "before" ? "Before" : "After"}</div>
          {rows.map((row, i) =>
            (side === "before" && row.kind === "added") || (side === "after" && row.kind === "removed") ? (
              <div key={i} aria-hidden className="min-h-[1em]" />
            ) : (
              <ProseLine key={i} row={row} side={side} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/** What a package row says about its change. */
export function packageNote(change: PackageChange, manifest: string): { text: string; warn: boolean } {
  const where = change.inManifest === null ? "" : change.inManifest ? `In ${manifest}` : `Not in ${manifest}`;
  const what = change.kind === "downgrade" ? "Downgrade" : change.kind === "added" ? "Added" : change.kind === "removed" ? "Removed" : "";
  const text = [what, what === "" ? where : where.toLowerCase()].filter((part) => part !== "").join(", ");
  return { text, warn: change.kind === "downgrade" };
}

const PACKAGE_ROWS = 12;

function LockfileBody({ change, manifest, mode, initiallyRaw }: { change: Change; manifest?: Change; mode: "unified" | "split"; initiallyRaw: boolean }) {
  const [raw, setRaw] = useState(initiallyRaw);
  const [all, setAll] = useState(false);
  const manifestName = manifestFor(change.label!).split("/").at(-1)!;
  const packages = lockfilePackages(change.label!, change.patch!, manifest?.patch);
  const shown = all ? packages : packages.slice(0, PACKAGE_ROWS);
  return (
    <div>
      {raw ? null : (
        <ul>
          {shown.map((pkg) => {
            const note = packageNote(pkg, manifestName);
            return (
              <li key={pkg.name} className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-xs">
                <span className="w-3 shrink-0" />
                <span className="min-w-0 max-w-[40%] shrink-0 truncate font-mono text-foreground">{pkg.name}</span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {pkg.from ?? "—"} → <span className={note.warn ? "text-warning" : "text-foreground"}>{pkg.to ?? "—"}</span>
                </span>
                <span className={cn("min-w-0 flex-1 truncate text-right", note.warn ? "text-warning" : "text-muted-foreground")}>
                  {note.warn ? "⚠ " : ""}
                  {note.text}
                </span>
              </li>
            );
          })}
          {packages.length === 0 ? (
            <li className="border-b border-border px-2.5 py-1.5 pl-7 text-xs text-muted-foreground">No package changed version.</li>
          ) : null}
          {packages.length > PACKAGE_ROWS && !all ? (
            <li className="border-b border-border px-2.5 py-1.5 pl-7 text-xs">
              <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => setAll(true)}>
                {packages.length - PACKAGE_ROWS} more packages
              </button>
            </li>
          ) : null}
        </ul>
      )}
      {raw ? (
        <div className="text-[11px]">
          <Diff patch={change.patch!} path={change.label!} view={mode} overflow="wrap" showLineNumbers={false} />
        </div>
      ) : null}
      <div className="px-2.5 py-1.5 pl-7 text-xs">
        <button type="button" className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => setRaw((v) => !v)}>
          {raw ? "Show the packages" : "Show the raw diff"}
        </button>
      </div>
    </div>
  );
}

export function ChangesBlock({ item, draft, onDraftChange, initialMode = "unified", initiallyOpen, initiallyRaw = false }: ChangesBlockProps) {
  const editable = onDraftChange !== undefined && item.changes.some(usesDraftAsAfter);
  const [mode, setMode] = useState<ChangesMode>(initialMode === "edit" && !editable ? "unified" : initialMode);
  const [open, setOpen] = useState<boolean[]>(() => item.changes.map((change, i) => (initiallyOpen ? initiallyOpen.includes(i) : !change.collapsed)));
  const view = mode === "split" ? "split" : "unified";

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {item.changesLabel} · {item.changes.length}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
          <Segment active={mode === "unified"} onClick={() => setMode("unified")}>
            Unified
          </Segment>
          <Segment active={mode === "split"} onClick={() => setMode("split")}>
            Split
          </Segment>
          {editable ? (
            <Segment active={mode === "edit"} onClick={() => setMode("edit")}>
              Edit
            </Segment>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {item.changes.map((change, i) => {
          const code = changeFormat(change) === "code";
          const after = usesDraftAsAfter(change) ? draft : (change.after ?? "");
          const patch =
            change.patch ?? (code && change.before !== undefined ? textPatch(change.label!, change.before, after) : undefined);
          const rows = patch === undefined ? pairLines(change.before ?? "", after) : [];
          const counts = patch === undefined ? proseCounts(rows) : patchCounts(patch);
          const lockfile = patch !== undefined && lockfileKind(change.label!) !== null;
          const manifest = lockfile ? item.changes.find((other) => other.label === manifestFor(change.label!)) : undefined;
          const packages = lockfile ? lockfilePackages(change.label!, patch!, manifest?.patch).length : 0;
          const editing = mode === "edit" && usesDraftAsAfter(change);
          return (
            <div key={`${change.label}:${i}`} className="overflow-hidden rounded-md border border-border">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-state-hover"
                aria-expanded={open[i]}
                onClick={() => setOpen((current) => current.map((value, j) => (j === i ? !value : value)))}
              >
                <span className="w-3 shrink-0 text-muted-foreground">{open[i] ? "▾" : "▸"}</span>
                <span className={cn("min-w-0 flex-1 truncate text-foreground", code && "font-mono")}>{change.label}</span>
                {lockfile ? <span className="shrink-0 text-muted-foreground">{packages === 1 ? "1 package" : `${packages} packages`}</span> : null}
                <CountsLabel counts={counts} />
              </button>
              {!open[i] ? null : (
                <div className="border-t border-border">
                  {editing ? (
                    <textarea
                      aria-label={change.label}
                      spellCheck={false}
                      autoFocus
                      className="block w-full resize-y bg-background px-3 py-2 font-mono text-sm leading-relaxed text-foreground focus-visible:outline-none"
                      rows={Math.min(16, Math.max(4, draft.split("\n").length + Math.ceil(draft.length / 90)))}
                      value={draft}
                      onChange={(event) => onDraftChange!(event.target.value)}
                    />
                  ) : lockfile ? (
                    <LockfileBody change={{ ...change, patch }} manifest={manifest} mode={view} initiallyRaw={initiallyRaw} />
                  ) : patch !== undefined ? (
                    <div className="text-[11px]">
                      <Diff patch={patch} path={change.label!} view={view} overflow="wrap" showLineNumbers={false} />
                    </div>
                  ) : (
                    <ProseBody rows={rows} mode={view} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
