// The search box in the page header that opens a person's page. Display only:
// the logins come with the page's data.
import { useId, useMemo, useState, type KeyboardEvent } from "react";

import { Icon } from "./ui/icon";

/** As many as fit under the box without scrolling. */
const SHOWN = 8;

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

export function PersonFinder({
  everyone,
  current = null,
  onOpenPerson,
  initialQuery = "",
  initialOpen = false,
}: {
  /** Most recently active first. */
  everyone: readonly string[];
  /** The person whose page this is, marked in the list. */
  current?: string | null;
  onOpenPerson: (login: string) => void;
  /** For stories. */
  initialQuery?: string;
  initialOpen?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(initialOpen);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => matchPeople(everyone, query), [everyone, query]);
  const listId = useId();

  const choose = (login: string) => {
    setQuery("");
    setOpen(false);
    setActive(0);
    onOpenPerson(login);
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
      const login = matches[active];
      if (open && login !== undefined) {
        event.preventDefault();
        choose(login);
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

  return (
    <div className="relative">
      <Icon
        name="Search"
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        role="combobox"
        aria-label="Find a person"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Find a person"
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
          aria-label="People"
          className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-border bg-popover py-1 text-xs text-popover-foreground shadow-md"
        >
          {matches.map((login, index) => (
            <li
              key={login}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Before the input's blur, which would close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(login);
              }}
              onMouseEnter={() => setActive(index)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-2 py-1 ${index === active ? "bg-muted" : ""}`}
            >
              <span className="truncate">{login}</span>
              {login === current ? <span className="text-muted-foreground">this page</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
