// The open lists' toolbar: Sort, a menu per filter, each saying what it is
// set to and counting what each choice would leave, and Batch at the end.
// The lists are paged on the server, so every change goes back there.
// Display only.
import type { ReactNode } from "react";

import type { OpenFacets, OpenQuery } from "@/dashboard/contract";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type Kind = "issue" | "pull";
type Sort = OpenQuery["sort"];

const SORTS: Record<Kind, Sort[]> = { pull: ["opened", "activity", "size", "author"], issue: ["opened", "activity", "author"] };
const SORT_LABEL: Record<Sort, string> = { opened: "Opened", activity: "Last activity", size: "Size", author: "Author" };
const DIRECTION_LABEL: Record<Sort, { asc: string; desc: string }> = {
  opened: { asc: "Oldest", desc: "Newest" },
  activity: { asc: "Least recent", desc: "Most recent" },
  size: { asc: "Smallest", desc: "Biggest" },
  author: { asc: "A–Z", desc: "Z–A" },
};
const SORT_WORDS: Record<Sort, { asc: string; desc: string }> = {
  opened: { asc: "oldest first", desc: "newest first" },
  activity: { asc: "least recently active first", desc: "most recently active first" },
  size: { asc: "smallest first", desc: "biggest first" },
  author: { asc: "by author, A to Z", desc: "by author, Z to A" },
};

/** The direction a sort starts in when picked: the long-waiting, stale, and big ones first. */
function startingDirection(sort: Sort): OpenQuery["direction"] {
  return sort === "size" ? "desc" : "asc";
}

/** What the filters keep, as a phrase: "Drafts nobody is assigned to". */
export function describeFilters(kind: Kind, query: OpenQuery, quietDays = 30): string {
  const filtered = query.author !== null || query.assignee !== null || query.state !== null || query.quiet;
  const noun =
    query.state === "draft"
      ? "Drafts"
      : query.state === "ready"
        ? "Pull requests ready for review"
        : filtered
          ? kind === "issue" ? "Issues" : "Pull requests"
          : kind === "issue" ? "Every open issue" : "Every open pull request";
  const by = query.author === null ? "" : ` by ${query.author}`;
  const assigned = query.assignee === null ? "" : query.assignee === "" ? " nobody is assigned to" : ` assigned to ${query.assignee}`;
  const quiet = query.quiet ? `, quiet for ${quietDays}+ days` : "";
  return `${noun}${by}${assigned}${quiet}`;
}

/** The line under the title: what the list shows, in words, and in what order. */
export function describeQuery(kind: Kind, query: OpenQuery, quietDays = 30): string {
  return `${describeFilters(kind, query, quietDays)}, ${SORT_WORDS[query.sort][query.direction]}.`;
}

function Trigger({ label, value, active, icon }: { label: string; value: string; active: boolean; icon?: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className={cn("h-7 gap-1.5 px-2 font-normal text-muted-foreground", active && "border-foreground/30 text-foreground")}>
        {icon ? <Icon name={icon} className="size-3.5" /> : null}
        {label}
        <span className={cn(active ? "font-medium text-foreground" : "")}>{value}</span>
        <Icon name="ChevronDown" className="size-3" />
      </Button>
    </DropdownMenuTrigger>
  );
}

function Choice({ checked, count, trailing, onSelect, children }: { checked: boolean; count?: number; trailing?: ReactNode; onSelect: () => void; children: ReactNode }) {
  return (
    <DropdownMenuItem role="menuitemradio" aria-checked={checked} onSelect={onSelect} className="justify-between gap-3">
      <span className="min-w-0 truncate">{children}</span>
      <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
        {count === undefined ? null : count}
        {trailing}
        <Icon name="Check" className={cn("size-3.5", checked ? "opacity-100" : "opacity-0")} />
      </span>
    </DropdownMenuItem>
  );
}

/** Long lists of people scroll inside the menu rather than past the window. */
const PEOPLE = "max-h-72 overflow-y-auto";

export function ListToolbar({
  kind,
  query,
  facets,
  onQuery,
  onBatch,
  batchCount,
  quietDays = 30,
}: {
  kind: Kind;
  query: OpenQuery;
  facets: OpenFacets;
  onQuery: (next: OpenQuery) => void;
  /** Opens Batch over every row the query matches. */
  onBatch: () => void;
  /** How many rows the query matches; Batch is disabled at none. */
  batchCount: number;
  quietDays?: number;
}) {
  const set = (fields: Partial<OpenQuery>) => onQuery({ ...query, ...fields });
  const sortBy = (sort: Sort) =>
    set(sort === query.sort ? { direction: query.direction === "asc" ? "desc" : "asc" } : { sort, direction: startingDirection(sort) });
  const assigned = query.assignee === null ? "Anyone" : query.assignee === "" ? "Nobody" : query.assignee;
  const state = query.state === null ? "All" : query.state === "draft" ? "Drafts" : "Ready";

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <DropdownMenu>
        <Trigger icon="ArrowUpDown" label="Sort" value={`${SORT_LABEL[query.sort]} · ${DIRECTION_LABEL[query.sort][query.direction]}`} active={false} />
        <DropdownMenuContent align="end" className="w-52">
          {SORTS[kind].map((sort) => (
            <Choice
              key={sort}
              checked={sort === query.sort}
              trailing={sort === query.sort ? <Icon name={query.direction === "asc" ? "ArrowUp" : "ArrowDown"} className="size-3.5" /> : null}
              onSelect={() => sortBy(sort)}
            >
              {SORT_LABEL[sort]}
            </Choice>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Trigger label="Author" value={query.author ?? "All"} active={query.author !== null} />
        <DropdownMenuContent align="end" className={cn("w-56", PEOPLE)}>
          <Choice checked={query.author === null} onSelect={() => set({ author: null })}>
            Anyone
          </Choice>
          <DropdownMenuSeparator />
          {facets.authors.map(({ login, count }) => (
            <Choice key={login} checked={query.author === login} count={count} onSelect={() => set({ author: login })}>
              {login}
            </Choice>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <Trigger label="Assigned" value={assigned} active={query.assignee !== null} />
        <DropdownMenuContent align="end" className={cn("w-56", PEOPLE)}>
          <Choice checked={query.assignee === null} onSelect={() => set({ assignee: null })}>
            Anyone
          </Choice>
          <Choice checked={query.assignee === ""} count={facets.nobody} onSelect={() => set({ assignee: "" })}>
            Nobody
          </Choice>
          {facets.assignees.length === 0 ? null : <DropdownMenuSeparator />}
          {facets.assignees.map(({ login, count }) => (
            <Choice key={login} checked={query.assignee === login} count={count} onSelect={() => set({ assignee: login })}>
              {login}
            </Choice>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {kind === "pull" ? (
        <DropdownMenu>
          <Trigger label="State" value={state} active={query.state !== null} />
          <DropdownMenuContent align="end" className="w-44">
            <Choice checked={query.state === null} count={facets.drafts + facets.ready} onSelect={() => set({ state: null })}>
              All
            </Choice>
            <Choice checked={query.state === "draft"} count={facets.drafts} onSelect={() => set({ state: "draft" })}>
              Drafts
            </Choice>
            <Choice checked={query.state === "ready"} count={facets.ready} onSelect={() => set({ state: "ready" })}>
              Ready
            </Choice>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <span title={`Only the ones with no activity for ${quietDays} days`}>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={query.quiet}
          onClick={() => set({ quiet: !query.quiet })}
          className={cn("h-7 gap-1.5 px-2 font-normal text-muted-foreground", query.quiet && "border-foreground/30 font-medium text-foreground")}
        >
          Quiet {quietDays}+ days
          <span className="font-normal tabular-nums text-muted-foreground">{facets.quiet}</span>
        </Button>
      </span>

      <span title={batchCount === 0 ? "Nothing matches the filters" : undefined}>
        <Button variant="outline" size="sm" disabled={batchCount === 0} onClick={onBatch} className="h-7 gap-1.5 px-2">
          <Icon name="Layers" className="size-3.5" />
          Batch
        </Button>
      </span>
    </span>
  );
}
