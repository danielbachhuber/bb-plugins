// What the Next page draws, given a loaded list. It loads nothing itself, so
// the story can render it with fixtures.
import type { ReactNode } from "react";
import { UrlLink } from "@get-bb/plugin-sdk/app";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import type { NextList, SourceStatus } from "./contract.js";
import { describeDue, type DueTone } from "./due.js";
import type { Item } from "./types.js";

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

const DUE_TONE: Record<DueTone, string> = {
  overdue: "text-destructive-text",
  today: "text-success",
  upcoming: "text-muted-foreground",
};

const PRIORITY: Record<1 | 2 | 3, string> = {
  1: "border-destructive/40 text-destructive-text",
  2: "border-warning/40 text-warning-text",
  3: "border-border text-foreground",
};

function ItemRow({ item, now }: { item: Item; now: Date }) {
  const due = item.due === null ? null : describeDue(item.due, now);

  return (
    <li className="py-2.5 text-sm">
      <div className="flex items-start gap-3">
        <UrlLink href={item.url} className="min-w-0 flex-1 text-foreground hover:underline">
          {item.title}
        </UrlLink>
        {item.priority === null ? null : (
          <span
            className={cn(
              "mt-0.5 shrink-0 rounded border px-1.5 font-mono text-[11px] leading-4",
              PRIORITY[item.priority],
            )}
          >
            P{item.priority}
          </span>
        )}
      </div>
      {item.description === "" ? null : (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
      )}
      {due === null && item.context === null && item.tags.length === 0 ? null : (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {due === null ? null : (
            <span className={cn("inline-flex items-center gap-1", DUE_TONE[due.tone])}>
              <Icon name="Calendar" className="size-3" />
              {due.text}
              {item.due?.recurring ? (
                <Icon name="Repeat" className="size-3" aria-label="Recurring" />
              ) : null}
            </span>
          )}
          {item.tags.map((tag) => (
            <span key={tag}>@{tag}</span>
          ))}
          {item.context === null ? null : <span className="ml-auto truncate">{item.context}</span>}
        </div>
      )}
    </li>
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
    </div>
  );
}

export interface ItemListViewProps {
  /** Null while the first load is in flight. */
  list: NextList | null;
  /** Due dates read relative to this. */
  now: Date;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function ItemListView({ list, now, refreshing = false, onRefresh }: ItemListViewProps) {
  const sources = list?.sources ?? [];
  const loaded = sources.filter((source): source is LoadedSource => source.state === "ok");
  const problems = sources.filter((source): source is ProblemSource => source.state !== "ok");

  return (
    <div className="mx-auto box-border w-full max-w-3xl px-4 pb-4 pt-3 md:px-5 md:pt-4">
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 flex-wrap gap-x-4 text-sm text-muted-foreground">
          {loaded.length === 0
            ? "Next"
            : loaded.map((source) => <SourceSummary key={source.id} source={source} />)}
        </p>
        {onRefresh === undefined ? null : (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            aria-label="Refresh"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <Icon name={refreshing ? "Spinner" : "ArrowReloadHorizontal"} className="size-4" />
          </Button>
        )}
      </div>

      {problems.length === 0 ? null : (
        <div className="mt-3 space-y-2">
          {problems.map((source) => (
            <SourceProblem key={source.id} source={source} />
          ))}
        </div>
      )}

      <div className="mt-3">
        {list === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : loaded.length === 0 ? null : list.items.length === 0 ? (
          <EmptyState>Nothing to do next.</EmptyState>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
            {list.items.map((item) => (
              <ItemRow key={item.id} item={item} now={now} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
