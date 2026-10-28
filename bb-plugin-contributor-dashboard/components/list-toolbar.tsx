// The lists' toolbar: Sort, a menu per filter, each saying what it is set to
// and counting what each choice would leave, and Batch at the end. The open
// lists use ListToolbar; the person and stage pages build theirs from the
// same pieces. Display only.
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

/** One way a list can be ordered, and what its two directions are called. */
export interface SortOption<S extends string> {
  key: S;
  label: string;
  asc: string;
  desc: string;
  /** The direction it starts in when picked: whichever puts the ones to act on first. */
  start: "asc" | "desc";
}

/** Sort: picking the current key again turns its direction around. */
export function SortMenu<S extends string>({
  options,
  sort,
  direction,
  onSort,
}: {
  options: readonly SortOption<S>[];
  sort: S;
  direction: "asc" | "desc";
  onSort: (sort: S, direction: "asc" | "desc") => void;
}) {
  const current = options.find((option) => option.key === sort) ?? options[0]!;
  return (
    <DropdownMenu>
      <Trigger icon="ArrowUpDown" label="Sort" value={`${current.label} · ${current[direction]}`} active={false} />
      <DropdownMenuContent align="end" className="w-56">
        {options.map((option) => (
          <Choice
            key={option.key}
            checked={option.key === sort}
            trailing={option.key === sort ? <Icon name={direction === "asc" ? "ArrowUp" : "ArrowDown"} className="size-3.5" /> : null}
            onSelect={() => onSort(option.key, option.key === sort ? (direction === "asc" ? "desc" : "asc") : option.start)}
          >
            {option.label}
          </Choice>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A menu of people, such as Author or Assigned, with Anyone first. With
 * `nobody` set it offers Nobody too, which picks the empty string.
 */
export function PeopleMenu({
  label,
  value,
  counts,
  nobody,
  onPick,
}: {
  label: string;
  value: string | null;
  counts: ReadonlyArray<{ login: string; count: number }>;
  nobody?: number;
  onPick: (login: string | null) => void;
}) {
  const shown = value === null ? (nobody === undefined ? "All" : "Anyone") : value === "" ? "Nobody" : value;
  return (
    <DropdownMenu>
      <Trigger label={label} value={shown} active={value !== null} />
      <DropdownMenuContent align="end" className={cn("w-56", PEOPLE)}>
        <Choice checked={value === null} onSelect={() => onPick(null)}>
          Anyone
        </Choice>
        {nobody === undefined ? null : (
          <Choice checked={value === ""} count={nobody} onSelect={() => onPick("")}>
            Nobody
          </Choice>
        )}
        {counts.length === 0 ? null : <DropdownMenuSeparator />}
        {counts.map(({ login, count }) => (
          <Choice key={login} checked={value === login} count={count} onSelect={() => onPick(login)}>
            {login}
          </Choice>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A menu of fixed choices, such as State, with All first counting every one. */
export function ChoiceMenu<V extends string>({
  label,
  value,
  choices,
  onPick,
}: {
  label: string;
  value: V | null;
  choices: ReadonlyArray<{ key: V; label: string; count: number }>;
  onPick: (value: V | null) => void;
}) {
  return (
    <DropdownMenu>
      <Trigger label={label} value={choices.find((choice) => choice.key === value)?.label ?? "All"} active={value !== null} />
      <DropdownMenuContent align="end" className="w-44">
        <Choice checked={value === null} count={choices.reduce((sum, choice) => sum + choice.count, 0)} onSelect={() => onPick(null)}>
          All
        </Choice>
        {choices.map((choice) => (
          <Choice key={choice.key} checked={value === choice.key} count={choice.count} onSelect={() => onPick(choice.key)}>
            {choice.label}
          </Choice>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A filter that is on or off, with how many it would keep. */
export function ToggleChip({ label, title, on, count, onToggle }: { label: string; title: string; on: boolean; count: number; onToggle: () => void }) {
  return (
    <span title={title}>
      <Button
        variant="outline"
        size="sm"
        aria-pressed={on}
        onClick={onToggle}
        className={cn("h-7 gap-1.5 px-2 font-normal text-muted-foreground", on && "border-foreground/30 font-medium text-foreground")}
      >
        {label}
        <span className="font-normal tabular-nums text-muted-foreground">{count}</span>
      </Button>
    </span>
  );
}

/** Opens Batch over every row the filters match; disabled at none. */
export function BatchButton({ count, onBatch }: { count: number; onBatch: () => void }) {
  return (
    <span title={count === 0 ? "Nothing matches the filters" : undefined}>
      <Button variant="outline" size="sm" disabled={count === 0} onClick={onBatch} className="h-7 gap-1.5 px-2">
        <Icon name="Layers" className="size-3.5" />
        Batch
      </Button>
    </span>
  );
}

const OPEN_SORTS: Record<Sort, SortOption<Sort>> = {
  opened: { key: "opened", label: SORT_LABEL.opened, ...DIRECTION_LABEL.opened, start: startingDirection("opened") },
  activity: { key: "activity", label: SORT_LABEL.activity, ...DIRECTION_LABEL.activity, start: startingDirection("activity") },
  size: { key: "size", label: SORT_LABEL.size, ...DIRECTION_LABEL.size, start: startingDirection("size") },
  author: { key: "author", label: SORT_LABEL.author, ...DIRECTION_LABEL.author, start: startingDirection("author") },
};

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

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <SortMenu options={SORTS[kind].map((sort) => OPEN_SORTS[sort])} sort={query.sort} direction={query.direction} onSort={(sort, direction) => set({ sort, direction })} />
      <PeopleMenu label="Author" value={query.author} counts={facets.authors} onPick={(author) => set({ author })} />
      <PeopleMenu label="Assigned" value={query.assignee} counts={facets.assignees} nobody={facets.nobody} onPick={(assignee) => set({ assignee })} />
      {kind === "pull" ? (
        <ChoiceMenu
          label="State"
          value={query.state}
          choices={[
            { key: "draft", label: "Drafts", count: facets.drafts },
            { key: "ready", label: "Ready", count: facets.ready },
          ]}
          onPick={(state) => set({ state })}
        />
      ) : null}
      <ToggleChip
        label={`Quiet ${quietDays}+ days`}
        title={`Only the ones with no activity for ${quietDays} days`}
        on={query.quiet}
        count={facets.quiet}
        onToggle={() => set({ quiet: !query.quiet })}
      />
      <BatchButton count={batchCount} onBatch={onBatch} />
    </span>
  );
}
