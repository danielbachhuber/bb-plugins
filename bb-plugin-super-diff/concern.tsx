// A concern's file list: each file with what its change does and whether it
// has been viewed. Files the agent describes
// together ("only the import is renamed") fold into one line.
import type { ReactNode } from "react";
import { ViewedProgress } from "@danielbachhuber/bb-plugin-component-library/viewed-ring";
import { Prose } from "./annotations";

export type ConcernFile = { path: string; summary?: string };

function name(path: string): string {
  return path.split("/").pop() ?? path;
}

function Mark({ viewed }: { viewed: boolean }) {
  return viewed ? (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-label="Viewed" className="shrink-0 text-foreground">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="m8 12 3 3 5-6" fill="none" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-label="Not viewed" className="shrink-0 text-muted-foreground">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const EMPTY: ReadonlySet<string> = new Set();

/** Marks a file edited since the Super Diff was written, in the row's amber. */
function ChangedPill() {
  return (
    <span
      className="shrink-0 rounded px-1.5 font-medium"
      style={{ color: "var(--warning-text)", background: "color-mix(in oklab, var(--warning) 14%, transparent)", fontSize: 10.5 }}
      title="Edited since the Super Diff was written, so its summary may be out of date"
    >
      changed
    </span>
  );
}

/**
 * `viewed` is null until bb's Viewed marks are read: the marks are left out.
 * Clicking a file calls `onJump` with its path.
 */
export function ConcernFiles({
  files,
  others,
  viewed,
  onJump,
  changed = EMPTY,
}: {
  files: ConcernFile[];
  others?: string;
  viewed: ReadonlySet<string> | null;
  onJump: (path: string) => void;
  /** Files edited since the Super Diff was written, whose summaries may be out of date. */
  changed?: ReadonlySet<string>;
}) {
  const described = files.filter((file) => file.summary);
  const rest = files.filter((file) => !file.summary);
  const folded = others !== undefined && rest.length > 0;
  const rows = folded ? described : files;
  return (
    <div className="mt-2 rounded-md border border-border bg-background px-1.5 py-1 text-xs">
      {rows.map((file) => {
        const isViewed = viewed?.has(file.path) ?? false;
        return (
          <button
            key={file.path}
            type="button"
            title={file.path}
            onClick={() => onJump(file.path)}
            className="flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left hover:bg-state-hover"
            style={isViewed ? { opacity: 0.6 } : undefined}
          >
            {viewed !== null ? (
              <span style={{ position: "relative", top: 2 }}>
                <Mark viewed={isViewed} />
              </span>
            ) : null}
            <span className="shrink-0 font-mono text-foreground" style={{ fontSize: 11.5 }}>
              {name(file.path)}
            </span>
            <span className="min-w-0 text-muted-foreground">
              <Prose text={file.summary ?? ""} />
            </span>
            {changed.has(file.path) ? <ChangedPill /> : null}
          </button>
        );
      })}
      {folded ? (
        <div className="px-1 py-0.5 text-muted-foreground" style={{ paddingLeft: viewed !== null && rows.length > 0 ? 25 : 4 }}>
          {rows.length > 0 ? `and ${rest.length} more ` : `${rest.length} `}
          {rest.length === 1 ? "file" : "files"}
          {viewed !== null ? ` (${rest.filter((file) => viewed.has(file.path)).length} viewed)` : ""}: <Prose text={others ?? ""} />
          {rest.some((file) => changed.has(file.path)) ? (
            <span style={{ color: "var(--warning-text)" }}> · {rest.filter((file) => changed.has(file.path)).length} changed</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A section's heading: number, title, viewed count (or the file count until
 * the Viewed marks are read), explanation, and (for a concern) its file list, then `children`, which is
 * where its annotations go. Every heading after the first has a rule above it.
 */
export function ConcernHeader({
  number,
  first,
  title,
  explanation,
  files,
  others,
  showList,
  viewed,
  onJump,
  changed,
  children,
}: {
  number: number | null;
  first: boolean;
  title: string;
  explanation: string;
  files: ConcernFile[];
  others?: string;
  showList: boolean;
  viewed: ReadonlySet<string> | null;
  onJump: (path: string) => void;
  changed?: ReadonlySet<string>;
  children?: ReactNode;
}) {
  return (
    <header className={`px-1 pb-3 ${first ? "pt-2" : "mt-4 border-t border-border pt-5"}`}>
      <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
        {number !== null ? <NumberBadge n={number} /> : null}
        <span className="min-w-0">{title}</span>
      </h2>
      <div className="mt-1" style={{ paddingLeft: number !== null ? 32 : 0 }}>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {viewed !== null ? (
            <ViewedProgress viewed={files.filter((file) => viewed.has(file.path)).length} total={files.length} />
          ) : (
            <span>
              {files.length} {files.length === 1 ? "file" : "files"}
            </span>
          )}
        </span>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <Prose text={explanation} />
        </p>
        {showList ? <ConcernFiles files={files} others={others} viewed={viewed} onJump={onJump} changed={changed} /> : null}
        {children}
      </div>
    </header>
  );
}

function NumberBadge({ n }: { n: number }) {
  return (
    <span
      className="shrink-0 text-center tabular-nums"
      style={{
        width: 22,
        height: 22,
        borderRadius: 9999,
        background: "var(--foreground)",
        color: "var(--background)",
        font: "600 13px/22px system-ui",
      }}
    >
      {n}
    </span>
  );
}
