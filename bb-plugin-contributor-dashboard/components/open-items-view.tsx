// Every open issue or pull request, oldest first, reached from the Issues and
// Pull requests headings. The period does not apply: open is open now.
// Display only.
import type { OpenItemsResult } from "@/dashboard/contract";

import { ItemRow } from "./item-row";
import type { ThreadSeed } from "./thread-seed";

const DRAFT = "text-[#1baf7a] dark:text-[#199e70]";

const HEADINGS = { issue: "Open issues", pull: "Open pull requests" } as const;
const EMPTY = { issue: "No issues are open.", pull: "No pull requests are open." } as const;

function ago(iso: string, now: number): string {
  const elapsed = Math.round((now - Date.parse(iso)) / 86_400_000);
  if (elapsed < 1) return "today";
  if (elapsed === 1) return "yesterday";
  if (elapsed < 14) return `${elapsed} days ago`;
  return elapsed < 120 ? `${Math.round(elapsed / 7)} weeks ago` : `${Math.round(elapsed / 30)} months ago`;
}

function PageButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded border border-border px-2 py-0.5 text-foreground hover:bg-muted disabled:cursor-default disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function OpenItemsView({
  kind,
  data,
  error,
  onBack,
  onPage,
  onThread,
  now = Date.now(),
}: {
  kind: "issue" | "pull";
  data: OpenItemsResult | null;
  error: string | null;
  onBack: () => void;
  onPage: (page: number) => void;
  /** Opens the row's thread, or the composer that starts one. */
  onThread: (seed: ThreadSeed, threadId: string | null) => void;
  now?: number;
}) {
  const message = error ?? data?.sync.error ?? null;
  // A page for the other kind can still be in hand while this one loads.
  const shown = data?.kind === kind ? data : null;

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-5xl px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </button>
          <h1 className="text-sm font-medium">
            {HEADINGS[kind]}
            {shown === null ? null : (
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">{shown.paging.total}</span>
            )}
          </h1>
          {shown?.repository ? <span className="text-xs text-muted-foreground">{shown.repository}</span> : null}
        </div>

        {message === null ? null : (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {message}
          </p>
        )}

        {shown === null ? null : (
          <section className="mt-4" aria-label={HEADINGS[kind]}>
            <p className="text-xs text-muted-foreground">Oldest first, whatever span the dashboard shows.</p>
            {shown.rows.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{EMPTY[kind]}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-card text-sm">
                {shown.rows.map((row) => (
                  <ItemRow
                    key={row.number}
                    number={row.number}
                    title={row.title}
                    url={row.url}
                    assignees={row.assignees}
                    threadId={row.threadId}
                    onThread={() =>
                      onThread(
                        { kind, number: row.number, title: row.title, url: row.url, meta: `opened ${ago(row.createdAt, now)}` },
                        row.threadId,
                      )
                    }
                    facts={
                      <span>
                        {row.isDraft ? (
                          <>
                            <span className={DRAFT}>Draft</span>
                            {" · "}
                          </>
                        ) : null}
                        {row.author === null ? "" : `${row.author} · `}
                        opened {ago(row.createdAt, now)}
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
            {shown.paging.pages < 2 ? null : (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {shown.paging.from}–{shown.paging.to} of {shown.paging.total}
                </span>
                <span className="flex items-center gap-1">
                  <PageButton label="Previous" onClick={() => onPage(shown.paging.page - 1)} disabled={shown.paging.page === 0} />
                  <PageButton
                    label="Next"
                    onClick={() => onPage(shown.paging.page + 1)}
                    disabled={shown.paging.page >= shown.paging.pages - 1}
                  />
                </span>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
