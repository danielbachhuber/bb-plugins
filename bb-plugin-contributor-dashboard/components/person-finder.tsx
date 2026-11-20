// The search box in the page header that opens a person's or a team's page.
// Display only: the logins and team slugs come with the page's data.
import { useId, useMemo, useState, type KeyboardEvent } from "react";

import { Icon } from "./ui/icon";

/** As many as fit under the box without scrolling. */
const SHOWN = 8;
/** Places kept for teams, and the most shown while nothing is typed. */
const TEAMS_KEPT = 3;

/** A row in the list: a person by login, or a team by slug. */
export interface FinderEntry {
  kind: "person" | "team";
  name: string;
}

/**
 * Logins containing the query, those starting with it first. The list
 * arrives most recently active first, and each group keeps that order.
 */
export function matchPeople(everyone: readonly string[], query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return everyone.slice(0, SHOWN);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const login of everyone) {
    const at = login.toLowerCase().indexOf(needle);
    if (at === 0) starts.push(login);
    else if (at > 0) contains.push(login);
  }
  return [...starts, ...contains].slice(0, SHOWN);
}

/**
 * People, then teams, matching the query, as many as fit. Up to three teams
 * always keep a place, so a team still shows when many people match; while
 * nothing is typed, only those three.
 */
export function matchEntries(everyone: readonly string[], everyTeam: readonly string[], query: string): FinderEntry[] {
  const typed = query.trim() !== "";
  const teams = matchPeople(everyTeam, query).slice(0, typed ? SHOWN : TEAMS_KEPT);
  const people = matchPeople(everyone, query).slice(0, SHOWN - Math.min(teams.length, TEAMS_KEPT));
  return [
    ...people.map((name) => ({ kind: "person" as const, name })),
    ...teams.slice(0, SHOWN - people.length).map((name) => ({ kind: "team" as const, name })),
  ];
}

export function PersonFinder({
  everyone,
  everyTeam = [],
  current = null,
  onOpenPerson,
  onOpenTeam,
  initialQuery = "",
  initialOpen = false,
}: {
  /** Most recently active first. */
  everyone: readonly string[];
  /** Team slugs, the one with the most recently active member first. */
  everyTeam?: readonly string[];
  /** The person or team whose page this is, marked in the list. */
  current?: FinderEntry | null;
  onOpenPerson: (login: string) => void;
  onOpenTeam?: (slug: string) => void;
  /** For stories. */
  initialQuery?: string;
  initialOpen?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(initialOpen);
  const [active, setActive] = useState(0);
  const offered = onOpenTeam === undefined ? [] : everyTeam;
  const matches = useMemo(() => matchEntries(everyone, offered, query), [everyone, offered, query]);
  const listId = useId();

  const choose = (entry: FinderEntry) => {
    setQuery("");
    setOpen(false);
    setActive(0);
    if (entry.kind === "team") onOpenTeam?.(entry.name);
    else onOpenPerson(entry.name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const entry = matches[active];
      if (open && entry !== undefined) {
        event.preventDefault();
        choose(entry);
      }
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      } else {
        setQuery("");
      }
    }
  };

  const expanded = open && matches.length > 0;
  const label = offered.length === 0 ? "Find a person" : "Find a person or team";

  return (
    <div className="relative w-fit">
      <Icon
        name="Search"
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={label}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-7 w-52 rounded-md border border-border bg-transparent pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
      />
      {open && matches.length === 0 && query.trim() !== "" ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-muted-foreground shadow-md">
          Nobody matches “{query.trim()}”
        </div>
      ) : null}
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={offered.length === 0 ? "People" : "People and teams"}
          className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-popover py-1 text-xs text-popover-foreground shadow-md"
        >
          {matches.map((entry, index) => (
            <li
              key={`${entry.kind}:${entry.name}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Before the input's blur, which would close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(entry);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-2 py-1 ${index === active ? "bg-muted" : ""}`}
            >
              <span className="truncate">{entry.name}</span>
              {current !== null && entry.kind === current.kind && entry.name === current.name ? (
                <span className="shrink-0 text-muted-foreground">this page</span>
              ) : entry.kind === "team" ? (
                <span className="shrink-0 text-muted-foreground">team</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
