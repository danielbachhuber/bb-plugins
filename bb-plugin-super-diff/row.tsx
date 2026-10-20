// The row under bb's Diff tab picker: Generate Super Diff, then the
// Super Diff | Original toggle, the status line, and Regenerate when out of date.
import type { ReactNode } from "react";
import type { DiffFile as FileEntry, DiffTarget as Target, StoredSuperDiff } from "./grouping";

/**
 * "Out of date · 2 files added, 1 file removed, 3 files changed" from the
 * paths on the diff now and the files whose patches differ from when the
 * Super Diff was written, or null when nothing moved.
 */
export function staleText(stored: StoredSuperDiff, paths: string[] | null, fileCount: number | null, changed = 0): string | null {
  const plural = (n: number, word: string) => `${n} ${n === 1 ? "file" : "files"} ${word}`;
  if (paths === null) {
    const delta = fileCount === null ? 0 : fileCount - stored.paths.length;
    if (delta === 0 && changed === 0) return null;
    const parts = [delta ? plural(Math.abs(delta), delta > 0 ? "added" : "removed") : "", changed ? plural(changed, "changed") : ""];
    return `Out of date · ${parts.filter(Boolean).join(", ")}`;
  }
  const before = new Set(stored.paths);
  const now = new Set(paths);
  const added = paths.filter((path) => !before.has(path)).length;
  const removed = stored.paths.filter((path) => !now.has(path)).length;
  if (added === 0 && removed === 0 && changed === 0) return null;
  const parts = [added ? plural(added, "added") : "", removed ? plural(removed, "removed") : "", changed ? plural(changed, "changed") : ""];
  return `Out of date · ${parts.filter(Boolean).join(", ")}`;
}

/** One line of the row's list of concerns. `viewed` is null when Diff Viewed is not installed. */
export type ConcernLink = { number: number | null; title: string; viewed: number | null; total: number; changed?: number };

export type Explaining = { path: string; line: number; requestedAt: string };

export type Loaded = { files: FileEntry[]; patches: Map<string, string>; target: Target };

/** What Super Diff knows about one thread's diff target. Loaded from the server; the toggle is kept in memory. */
export type ThreadState =
  | { phase: "checking" }
  | { phase: "idle" }
  | { phase: "generating"; requestedAt: string }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      showing: "super" | "original";
      stored: StoredSuperDiff;
      /** The diff as it is now, loaded when the Super Diff is first shown. */
      data: Loaded | null;
      /** Lines the reviewer pressed Explain this on, whose notes are still being written. */
      explaining?: Explaining[];
    };

const svg = (children: ReactNode, className = "") => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`shrink-0 ${className}`}
    aria-hidden
  >
    {children}
  </svg>
);
const SparklesIcon = () =>
  svg(
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />,
  );
const SpinnerIcon = () => svg(<path d="M21 12a9 9 0 1 1-6.219-8.56" />, "animate-spin");
const AlertIcon = () =>
  svg(
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>,
  );
const RefreshIcon = () =>
  svg(
    <>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </>,
  );

function ago(since: number, now: number): string {
  const minutes = Math.floor((now - since) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/**
 * The row under bb's diff picker: Generate Super Diff on the left at first,
 * then a Super Diff | Original toggle in its place. The toggle copies bb's own
 * Stacked/Split control's classes, read from the page, so it matches it.
 */
export function SuperDiffRow({
  state,
  fileCount,
  segmentClass,
  segmentButtonClass,
  onGenerate,
  onShow,
  concernLinks = [],
  current = null,
  onJump = () => {},
  changedCount = 0,
}: {
  state: ThreadState;
  fileCount: number | null;
  segmentClass: string;
  segmentButtonClass: string;
  onGenerate: () => void;
  onShow: (showing: "super" | "original") => void;
  /** Every section of the Super Diff on show, listed under the toggle; empty while bb's list shows. */
  concernLinks?: ConcernLink[];
  /** The index in `concernLinks` of the section at the top of the list. */
  current?: number | null;
  onJump?: (index: number) => void;
  /** Files still in the diff whose patches have changed since the Super Diff was written. */
  changedCount?: number;
}) {
  const stale =
    state.phase === "ready" ? staleText(state.stored, state.data?.files.map((file) => file.path) ?? null, fileCount, changedCount) : null;
  const button = (label: ReactNode, onClick?: () => void, { primary = false, disabled = false } = {}) => (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium ${
        primary ? "bg-foreground text-background" : "bg-background text-foreground"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {label}
    </button>
  );
  const files = fileCount === null ? "the" : `the ${fileCount}`;
  // Nothing to group until the diff has a file in it.
  const empty = fileCount === 0 && state.phase !== "ready" && state.phase !== "generating";
  const concerns = state.phase === "ready" ? state.stored.submission.concerns.length : 0;
  const notes = state.phase === "ready" ? state.stored.submission.annotations.length : 0;
  return (
    <div
      className="mt-3 rounded-lg border border-border bg-state-hover px-3 py-2 text-xs text-muted-foreground"
      style={
        stale
          ? {
              background: "color-mix(in oklab, var(--warning) 12%, transparent)",
              borderColor: "color-mix(in oklab, var(--warning) 45%, var(--border))",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        {state.phase === "ready" ? (
          <div className={`${segmentClass} shrink-0 bg-background`} role="tablist" aria-label="Super Diff view">
            {(["super", "original"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={segmentButtonClass}
                aria-pressed={state.showing === value}
                onClick={() => onShow(value)}
              >
                {value === "original" ? "Original" : "Super Diff"}
              </button>
            ))}
          </div>
        ) : state.phase === "generating" ? (
          button(
            <>
              <SpinnerIcon />
              Generating…
            </>,
            undefined,
            { disabled: true },
          )
        ) : (
          button(
            <>
              <SparklesIcon />
              Generate Super Diff
            </>,
            onGenerate,
            { primary: true, disabled: empty || state.phase === "checking" },
          )
        )}
        {stale ? (
          <span className="-mr-1.5" style={{ color: "var(--warning-text)" }}>
            <AlertIcon />
          </span>
        ) : null}
        <span className={`min-w-0 flex-1 line-clamp-2 ${stale || state.phase === "error" ? "text-foreground" : ""}`} title={stale ?? undefined}>
          {empty && "No diff to generate from yet. Once this thread changes a file, Generate groups it by concern."}
          {!empty && (state.phase === "idle" || state.phase === "checking") && `Group ${files} files by concern, with a note on what each part does.`}
          {state.phase === "generating" &&
            `The thread's agent is reading ${files} files and writing the Super Diff (asked ${ago(Date.parse(state.requestedAt), Date.now())}; it waits its turn if the agent is busy).`}
          {!empty && state.phase === "error" && state.message}
          {state.phase === "ready" &&
            (stale ??
              `${concerns} ${concerns === 1 ? "concern" : "concerns"} · ${notes} ${notes === 1 ? "annotation" : "annotations"} · generated ${ago(Date.parse(state.stored.acceptedAt), Date.now())}`)}
        </span>
        {stale
          ? button(
              <>
                <RefreshIcon />
                Regenerate
              </>,
              onGenerate,
              { primary: true },
            )
          : null}
      </div>
      {concernLinks.length > 0 ? (
        <nav
          aria-label="Concerns"
          className="mt-2 grid gap-x-4 border-t border-border pt-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}
        >
          {concernLinks.map((link, index) => (
            <button
              key={`${link.number}:${link.title}`}
              type="button"
              title={link.title}
              aria-current={index === current ? "true" : undefined}
              onClick={() => onJump(index)}
              className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-left hover:bg-background"
              style={index === current ? { background: "var(--background)" } : undefined}
            >
              {link.number !== null ? (
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
                  {link.number}
                </span>
              ) : (
                <span className="shrink-0" style={{ width: 16 }} />
              )}
              <span className={`min-w-0 flex-1 truncate ${link.number !== null ? "font-medium text-foreground" : ""}`}>{link.title}</span>
              {link.changed ? (
                <span className="shrink-0 tabular-nums" style={{ color: "var(--warning-text)" }}>
                  {link.changed} changed
                </span>
              ) : null}
              <span className="shrink-0 tabular-nums">
                {link.viewed !== null ? `${link.viewed}/${link.total}` : link.total}
              </span>
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

