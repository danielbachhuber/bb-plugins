// A concern's file list: each file with what its change does and, when Diff
// Viewed is installed, whether it has been viewed. Files the agent describes
// together ("only the import is renamed") fold into one line.

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

/** "2 of 4 viewed" and a bar, for a concern heading. */
export function ViewedCount({ viewed, total }: { viewed: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-normal tabular-nums text-muted-foreground">
      {viewed} of {total} viewed
      <span
        aria-hidden
        style={{ display: "inline-block", width: 48, height: 4, borderRadius: 2, background: "var(--border)", overflow: "hidden" }}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${total === 0 ? 0 : (100 * viewed) / total}%`,
            background: "var(--diff-added, #16a34a)",
          }}
        />
      </span>
    </span>
  );
}

/**
 * `viewed` is null when Diff Viewed is not installed: the marks are left out.
 * Clicking a file calls `onJump` with its path.
 */
export function ConcernFiles({
  files,
  others,
  viewed,
  onJump,
}: {
  files: ConcernFile[];
  others?: string;
  viewed: ReadonlySet<string> | null;
  onJump: (path: string) => void;
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
            <span className="min-w-0 text-muted-foreground">{file.summary ?? ""}</span>
          </button>
        );
      })}
      {folded ? (
        <div className="px-1 py-0.5 text-muted-foreground" style={{ paddingLeft: viewed !== null ? 25 : 4 }}>
          {rows.length > 0 ? `and ${rest.length} more ` : `${rest.length} `}
          {rest.length === 1 ? "file" : "files"}
          {viewed !== null ? ` (${rest.filter((file) => viewed.has(file.path)).length} viewed)` : ""}: {others}
        </div>
      ) : null}
    </div>
  );
}
