// Sort and the Author filter for a list the page holds whole, such as what is
// waiting on a person's review. The server sends these lists unpaged, since
// one person has a dozen or so at most, so the toolbar runs here instead of
// asking again.
import { useMemo, useState } from "react";

import { filterPeople, peopleFacets, sortBy, type LoginCount, type SortDirection } from "@/review/list-query";

export interface LocalQuery<S extends string> {
  sort: S;
  direction: SortDirection;
  /** Null for anyone. */
  author: string | null;
}

export function useLocalList<T extends { author: string | null }, S extends string>(
  rows: readonly T[],
  keys: Record<S, (row: T) => number | string | null>,
  initial: LocalQuery<NoInfer<S>>,
): { query: LocalQuery<S>; setQuery: (next: LocalQuery<S>) => void; shown: T[]; authors: LoginCount[] } {
  const [query, setQuery] = useState(initial);
  const shown = useMemo(
    () => sortBy(filterPeople(rows, { author: query.author, assignee: null }), keys[query.sort], query.direction),
    // The keys are module constants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query],
  );
  const authors = useMemo(() => peopleFacets(rows, { author: query.author, assignee: null }).authors, [rows, query.author]);
  return { query, setQuery, shown, authors };
}
