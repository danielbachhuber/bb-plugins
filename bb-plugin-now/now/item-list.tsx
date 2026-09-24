// What the Now page draws, given a loaded list. It loads nothing itself, so
// the story can render it with fixtures.
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Listing, SourceStatus } from "./contract.js";
import { ItemRow, type PendingAction, type RowActions } from "./item-row.js";
import { groupIntoSections } from "./sections.js";

/** The dashed box bb's own list pages use for loading and empty states. */
function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

type LoadedSource = Extract<SourceStatus, { state: "ok" }>;
type ProblemSource = Extract<SourceStatus, { state: "error" | "unconfigured" }>;

/** "Todoist · today | overdue · 7", one per loaded source. */
function SourceSummary({ source }: { source: LoadedSource }) {
  return (
    <span>
      {source.name}
      {source.query === null ? null : (
        <>
          {" · "}
          <code className="text-foreground">{source.query}</code>
        </>
      )}
      {` · ${source.count}`}
    </span>
  );
}

/** Source text with `backticked` spans drawn as code. */
function WithCode({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className="text-foreground">
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
  );
}

function SourceProblem({ source }: { source: ProblemSource }) {
  const error = source.state === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        error ? "border-destructive/40 text-destructive-text" : "border-dashed border-border text-muted-foreground",
      )}
    >
      <span className="font-medium">{source.name}:</span> <WithCode text={error ? source.message : source.hint} />
      {error && source.kept > 0 ? (
        <span className="text-muted-foreground">
          {" "}
          Showing {source.kept} from the last sync.
        </span>
      ) : null}
    </div>
  );
}

export interface ItemListViewProps {
  /** Null until the stored list has been read. */
  listing: Listing | null;
  /** Due dates read relative to this. */
  now: Date;
  /** Without them the rows draw no action buttons. */
  actions?: RowActions;
  /** Rows waiting on an action, by item id. */
  pending?: ReadonlyMap<string, PendingAction>;
}

/**
 * The list as stored after the last sync. Refreshing lives in the page's
 * title bar, so this only draws.
 */
export function ItemListView({ listing, now, actions, pending = new Map() }: ItemListViewProps) {
  const [showSnoozed, setShowSnoozed] = useState(false);
  const snoozed = listing?.snoozed ?? [];
  const threads = listing?.threads ?? {};
  const list = listing?.list ?? null;
  const sources = list?.sources ?? [];
  const loaded = sources.filter((source): source is LoadedSource => source.state === "ok");
  const problems = sources.filter((source): source is ProblemSource => source.state !== "ok");

  return (
    <TooltipProvider delayDuration={300}>
    <div className="mx-auto box-border w-full max-w-6xl px-4 pb-4 pt-3 md:px-5 md:pt-4">
      {loaded.length === 0 ? null : (
        <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
          {loaded.map((source) => (
            <SourceSummary key={source.id} source={source} />
          ))}
        </p>
      )}

      {problems.length === 0 ? null : (
        <div className="mt-3 space-y-2 first:mt-0">
          {problems.map((source) => (
            <SourceProblem key={source.id} source={source} />
          ))}
        </div>
      )}

      <div className="mt-3">
        {listing === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : list === null ? (
          <EmptyState>{listing.syncing ? "Syncing for the first time…" : "Not synced yet."}</EmptyState>
        ) : list.items.length === 0 ? (
          loaded.length === 0 ? null : (
            <EmptyState>Nothing needs doing now.</EmptyState>
          )
        ) : (
          <div className="space-y-5">
            {groupIntoSections(list.items, now).map((section) => (
              <section key={section.id} aria-labelledby={`now-section-${section.id}`}>
                {/* The same small uppercase heading bb's sweeps give their sections. */}
                <h2
                  id={`now-section-${section.id}`}
                  className={cn(
                    "mb-1.5 flex items-center gap-2 px-1 text-[0.6875rem] font-medium uppercase tracking-wider",
                    section.id === "overdue" ? "text-destructive-text" : "text-muted-foreground",
                  )}
                >
                  {section.title}
                  <span className="tabular-nums text-muted-foreground">{section.items.length}</span>
                </h2>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
                  {section.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      now={now}
                      actions={actions}
                      threadId={threads[item.id] ?? null}
                      pending={pending.get(item.id) ?? null}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {snoozed.length === 0 ? null : (
        <div className="mt-4">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            aria-expanded={showSnoozed}
            onClick={() => setShowSnoozed((open) => !open)}
          >
            <Icon name={showSnoozed ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
            {snoozed.length} snoozed
          </Button>
          {showSnoozed ? (
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4 opacity-80">
              {snoozed.map(({ item, until }) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  now={now}
                  actions={actions}
                  snoozedUntil={until}
                  threadId={threads[item.id] ?? null}
                  pending={pending.get(item.id) ?? null}
                />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
