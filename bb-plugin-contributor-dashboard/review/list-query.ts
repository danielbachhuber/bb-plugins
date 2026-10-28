// Sorting and filtering for the lists on a person's page and a stage's page,
// as the open lists do it in open-items.ts: a sort with a direction, menus
// that narrow by person, and counts for what each choice would leave. Pure:
// the server runs it over paged lists, the page over lists it holds whole.

export type SortDirection = "asc" | "desc";

/** Stands for "nobody" where an assignee filter names a login; never a login itself. */
export const NOBODY = "";

export interface LoginCount {
  login: string;
  count: number;
}

/** Each login's count, most first, then by name. */
export function counted(logins: Iterable<string>): LoginCount[] {
  const counts = new Map<string, number>();
  for (const login of logins) counts.set(login, (counts.get(login) ?? 0) + 1);
  return [...counts]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
}

/**
 * Orders `rows` by `key`. Rows with no value, such as a pull request with no
 * review yet, go last whichever way it runs; ties keep the order they came in.
 */
export function sortBy<T>(rows: readonly T[], key: (row: T) => number | string | null, direction: SortDirection): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: key(row) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) return (a.value === null ? 1 : 0) - (b.value === null ? 1 : 0) || a.index - b.index;
      const order = typeof a.value === "string" ? a.value.localeCompare(b.value as string) : a.value - (b.value as number);
      return sign * order || a.index - b.index;
    })
    .map(({ row }) => row);
}

export interface PeopleFilter {
  /** Null for anyone. */
  author: string | null;
  /** Null for anyone, {@link NOBODY} for nobody, or a login. */
  assignee: string | null;
}

interface WithPeople {
  author: string | null;
  assignees?: readonly string[];
}

function matchesPeople(row: WithPeople, filter: PeopleFilter, skip?: keyof PeopleFilter): boolean {
  if (skip !== "author" && filter.author !== null && row.author !== filter.author) return false;
  if (skip !== "assignee" && filter.assignee !== null) {
    const assignees = row.assignees ?? [];
    if (filter.assignee === NOBODY ? assignees.length > 0 : !assignees.includes(filter.assignee)) return false;
  }
  return true;
}

export function filterPeople<T extends WithPeople>(rows: readonly T[], filter: PeopleFilter): T[] {
  return rows.filter((row) => matchesPeople(row, filter));
}

export interface PeopleFacets {
  authors: LoginCount[];
  assignees: LoginCount[];
  /** How many have nobody assigned. */
  nobody: number;
}

/** Each menu counts under the other filter but not its own, so its numbers say what picking a choice gives. */
export function peopleFacets(rows: readonly WithPeople[], filter: PeopleFilter): PeopleFacets {
  const byAssignee = rows.filter((row) => matchesPeople(row, filter, "assignee"));
  return {
    authors: counted(rows.filter((row) => matchesPeople(row, filter, "author")).flatMap((row) => (row.author === null ? [] : [row.author]))),
    assignees: counted(byAssignee.flatMap((row) => row.assignees ?? [])),
    nobody: byAssignee.filter((row) => (row.assignees ?? []).length === 0).length,
  };
}

// A person's own pull requests -------------------------------------------------

export type AuthoredSort = "opened" | "merged" | "firstReview" | "mergeTime" | "size";
/** Open means open and ready, as the row's own label says; a draft is Draft. */
export type AuthoredState = "open" | "draft" | "merged" | "closed";

export interface AuthoredQuery {
  sort: AuthoredSort;
  direction: SortDirection;
  /** Null for every state. */
  state: AuthoredState | null;
}

export const DEFAULT_AUTHORED_QUERY: AuthoredQuery = { sort: "opened", direction: "desc", state: null };

interface AuthoredLike {
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  createdAt: string;
  mergedAt: string | null;
  firstReviewDays: number | null;
  mergeDays: number | null;
  size: number | null;
}

export function authoredState(row: Pick<AuthoredLike, "state" | "isDraft">): AuthoredState {
  return row.state === "MERGED" ? "merged" : row.state === "CLOSED" ? "closed" : row.isDraft ? "draft" : "open";
}

const AUTHORED_KEY: Record<AuthoredSort, (row: AuthoredLike) => number | string | null> = {
  opened: (row) => row.createdAt,
  merged: (row) => row.mergedAt,
  firstReview: (row) => row.firstReviewDays,
  mergeTime: (row) => row.mergeDays,
  size: (row) => row.size,
};

/** The rows the query keeps, in its order. They arrive newest first, which ties keep. */
export function queryAuthored<T extends AuthoredLike>(rows: readonly T[], query: AuthoredQuery): T[] {
  const kept = query.state === null ? rows : rows.filter((row) => authoredState(row) === query.state);
  return sortBy(kept, AUTHORED_KEY[query.sort], query.direction);
}

export type AuthoredFacets = Record<AuthoredState, number>;

export function authoredFacets(rows: readonly Pick<AuthoredLike, "state" | "isDraft">[]): AuthoredFacets {
  const facets: AuthoredFacets = { open: 0, draft: 0, merged: 0, closed: 0 };
  for (const row of rows) facets[authoredState(row)] += 1;
  return facets;
}

// What is waiting in a stage ---------------------------------------------------

export type WaitingSort = "wait" | "author";

export interface WaitingQuery extends PeopleFilter {
  sort: WaitingSort;
  direction: SortDirection;
}

export const DEFAULT_WAITING_QUERY: WaitingQuery = { sort: "wait", direction: "desc", author: null, assignee: null };

interface WaitingLike extends WithPeople {
  days: number;
}

/** The rows the query keeps, in its order. They arrive longest wait first, which ties keep. */
export function queryWaiting<T extends WaitingLike>(rows: readonly T[], query: WaitingQuery): T[] {
  return sortBy(filterPeople(rows, query), query.sort === "wait" ? (row) => row.days : (row) => row.author ?? "", query.direction);
}
