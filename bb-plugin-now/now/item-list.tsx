// What the Now page draws, given a loaded list. It loads nothing itself, so
// the story can render it with fixtures.
import { useState, type ReactNode } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Listing, SourceStatus } from "./contract.js";
import { ItemRow, type PendingAction, type RowActions } from "./item-row.js";
import { SegmentedToggle } from "@/components/segmented";

import { groupIntoSections, type SectionId } from "./sections.js";
import type { Item, TodoistProject } from "./types.js";

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

/**
 * What the list is narrowed to: one section, or every row from one source, or
 * nothing, which stacks the sections.
 */
export type Filter = { section: SectionId } | { source: string } | null;

export interface ItemListViewProps {
  /** Null until the stored list has been read. */
  listing: Listing | null;
  /** Due dates read relative to this. */
  now: Date;
  /** Without them the rows draw no action buttons. */
  actions?: RowActions;
  /** Rows waiting on an action, by item id. */
  pending?: ReadonlyMap<string, PendingAction>;
  /** What the page opens on, for the stories: the Now section. */
  initialFilter?: Filter;
  /** Your Todoist projects, for the edit strip. Null until they load. */
  projects?: readonly TodoistProject[] | null;
}

/** Gmail before Todoist in the source picker, whatever order they sync in. */
const SOURCE_ORDER = ["gmail", "todoist"];

function sourceRank(id: string): number {
  const index = SOURCE_ORDER.indexOf(id);
  return index === -1 ? SOURCE_ORDER.length : index;
}

function Rows({ label, items, empty, renderRow }: {
  label: string;
  items: readonly Item[];
  empty: string;
  renderRow: (item: Item) => ReactNode;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul aria-label={label} className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
      {items.map(renderRow)}
    </ul>
  );
}

function emptyText(section: SectionId): string {
  return section === "now" ? "Nothing needs doing now." : "Nothing here.";
}

/**
 * The sections on the left and the sources on the right, one filter between
 * them: pressing a section shows that section from every source, pressing a
 * source shows every row from it, and pressing the chosen one again stacks
 * the sections. Each count is of every row, whatever is chosen.
 */
function FilteredList({
  items,
  sources,
  now,
  filter,
  onFilter,
  renderRow,
}: {
  items: readonly Item[];
  sources: readonly SourceStatus[];
  now: Date;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  renderRow: (item: Item) => ReactNode;
}) {
  const sections = groupIntoSections(items, now);
  const section = filter !== null && "section" in filter ? filter.section : null;
  const source = filter !== null && "source" in filter ? filter.source : null;
  let body: ReactNode;
  if (section !== null) {
    const shown = sections.find((each) => each.id === section)!;
    body = <Rows label={shown.title} items={shown.items} empty={emptyText(section)} renderRow={renderRow} />;
  } else if (source !== null) {
    // The merged list's order: soonest first for tasks, newest first for mail.
    const name = sources.find((each) => each.id === source)?.name ?? source;
    body = <Rows label={name} items={items.filter((item) => item.source === source)} empty="Nothing here." renderRow={renderRow} />;
  } else {
    body = (
      <div className="space-y-4">
        {sections.map((each) => (
          <section key={each.id} aria-label={each.title}>
            <h2 className="mb-1.5 flex items-baseline gap-1.5 px-1 text-xs font-medium text-foreground" title={each.hint}>
              {each.title}
              <span className="font-normal tabular-nums text-muted-foreground">{each.items.length}</span>
            </h2>
            <Rows label={each.title} items={each.items} empty={emptyText(each.id)} renderRow={renderRow} />
          </section>
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedToggle
          label="Section"
          options={sections.map((each) => ({ id: each.id, label: each.title, count: each.items.length, title: each.hint }))}
          value={section}
          onChange={(id) => onFilter(id === null ? null : { section: id })}
        />
        <SegmentedToggle
          label="Source"
          options={[...sources].sort((a, b) => sourceRank(a.id) - sourceRank(b.id)).map((each) => ({
            id: each.id,
            label: each.name,
            count: items.filter((item) => item.source === each.id).length,
            title: each.state === "ok" && each.query !== null ? each.query : undefined,
          }))}
          value={source}
          onChange={(id) => onFilter(id === null ? null : { source: id })}
        />
      </div>
      <div className="mt-3">{body}</div>
    </>
  );
}

/**
 * The list as stored after the last sync. Refreshing lives in the page's
 * title bar, so this only draws.
 */
export function ItemListView({
  listing,
  now,
  actions,
  pending = new Map(),
  initialFilter = { section: "now" },
  projects = null,
}: ItemListViewProps) {
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const threads = listing?.threads ?? {};
  const list = listing?.list ?? null;
  const sources = list?.sources ?? [];
  const loaded = sources.filter((source): source is LoadedSource => source.state === "ok");
  const problems = sources.filter((source): source is ProblemSource => source.state !== "ok");

  return (
    <TooltipProvider delayDuration={300}>
    <div className="mx-auto box-border w-full max-w-6xl px-4 pb-4 pt-3 md:px-5 md:pt-4">
      {problems.length === 0 ? null : (
        <div className="mt-3 space-y-2 first:mt-0">
          {problems.map((source) => (
            <SourceProblem key={source.id} source={source} />
          ))}
        </div>
      )}

      <div className="mt-3 first:mt-0">
        {listing === null ? (
          <EmptyState>Loading…</EmptyState>
        ) : list === null ? (
          <EmptyState>{listing.syncing ? "Syncing for the first time…" : "Not synced yet."}</EmptyState>
        ) : list.items.length === 0 ? (
          loaded.length === 0 ? null : (
            <EmptyState>Nothing needs doing now.</EmptyState>
          )
        ) : (
          <FilteredList
            items={list.items}
            sources={sources}
            now={now}
            filter={filter}
            onFilter={setFilter}
            renderRow={(item) => (
              <ItemRow
                key={item.id}
                item={item}
                now={now}
                actions={actions}
                threadId={threads[item.id] ?? null}
                pending={pending.get(item.id) ?? null}
                projects={projects}
              />
            )}
          />
        )}
      </div>

    </div>
    </TooltipProvider>
  );
}
