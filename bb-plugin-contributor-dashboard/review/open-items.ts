// Everything open now, whatever the period: the lists the Issues and Pull
// requests headings open, narrowed and ordered by the list's toolbar. Pure:
// reads stored GitHub objects, makes no calls.
import type { Actor } from "../mirror/github.js";

export interface OpenItem {
  number: number;
  title: string;
  url: string;
  author: string | null;
  assignees: string[];
  /** Pull requests only; an issue is never a draft. */
  isDraft: boolean;
  createdAt: string;
  /** The last change GitHub recorded on it, of any kind. */
  updatedAt: string;
  /** Lines added and removed, for a pull request; null for an issue. */
  size: number | null;
}

interface Stored {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft?: boolean;
  createdAt: string;
  updatedAt?: string;
  additions?: number;
  deletions?: number;
  author: Actor | null;
  assignees: Actor[];
}

/** The open ones, oldest first, since the oldest have waited longest. */
export function openItems(items: readonly Stored[]): OpenItem[] {
  return items
    .filter((item) => item.state === "OPEN")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number)
    .map((item) => ({
      number: item.number,
      title: item.title,
      url: item.url,
      author: item.author?.login ?? null,
      assignees: item.assignees.map((assignee) => assignee.login),
      isDraft: item.isDraft ?? false,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt ?? item.createdAt,
      size: item.additions === undefined ? null : item.additions + (item.deletions ?? 0),
    }));
}

export type OpenSort = "opened" | "activity" | "size" | "author";
export type SortDirection = "asc" | "desc";

/** Stands for "nobody" where an assignee filter names a login; never a login itself. */
export const NOBODY = "";

/** How many days without activity make a row quiet. */
export const QUIET_DAYS = 30;
const DAY_MS = 86_400_000;

export interface OpenQuery {
  sort: OpenSort;
  direction: SortDirection;
  /** Null for anyone. */
  author: string | null;
  /** Null for anyone, {@link NOBODY} for nobody, or a login. */
  assignee: string | null;
  /** Pull requests only. Null for both. */
  state: "draft" | "ready" | null;
  /** Only rows with no activity for {@link QUIET_DAYS} days. */
  quiet: boolean;
}

export const DEFAULT_QUERY: OpenQuery = { sort: "opened", direction: "asc", author: null, assignee: null, state: null, quiet: false };

/** The direction a sort starts in when picked: the long-waiting, stale, and big ones first. */
export function defaultDirection(sort: OpenSort): SortDirection {
  return sort === "size" ? "desc" : "asc";
}

function isQuiet(item: OpenItem, now: number): boolean {
  return now - Date.parse(item.updatedAt) >= QUIET_DAYS * DAY_MS;
}

type Filter = "author" | "assignee" | "state" | "quiet";

function matches(item: OpenItem, query: OpenQuery, now: number, skip?: Filter): boolean {
  if (skip !== "author" && query.author !== null && item.author !== query.author) return false;
  if (skip !== "assignee" && query.assignee !== null) {
    if (query.assignee === NOBODY ? item.assignees.length > 0 : !item.assignees.includes(query.assignee)) return false;
  }
  if (skip !== "state" && query.state !== null && item.isDraft !== (query.state === "draft")) return false;
  if (skip !== "quiet" && query.quiet && !isQuiet(item, now)) return false;
  return true;
}

function compare(sort: OpenSort): (a: OpenItem, b: OpenItem) => number {
  switch (sort) {
    case "opened":
      return (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt);
    // Ascending is least recent first, so the stale ones lead, as oldest first does.
    case "activity":
      return (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
    case "size":
      return (a, b) => (a.size ?? 0) - (b.size ?? 0);
    case "author":
      return (a, b) => (a.author ?? "").localeCompare(b.author ?? "");
  }
}

/** The rows the query keeps, in its order. Ties fall back to oldest first, then number. */
export function queryOpen<T extends OpenItem>(items: readonly T[], query: OpenQuery, now: number): T[] {
  const by = compare(query.sort);
  const sign = query.direction === "asc" ? 1 : -1;
  return items
    .filter((item) => matches(item, query, now))
    .sort((a, b) => sign * by(a, b) || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.number - b.number);
}

export interface OpenFacets {
  /** Each author's count, most first, then by name. */
  authors: Array<{ login: string; count: number }>;
  /** Each assignee's count, most first; `nobody` counts the unassigned. */
  assignees: Array<{ login: string; count: number }>;
  nobody: number;
  drafts: number;
  ready: number;
  quiet: number;
}

function counted(logins: Iterable<string>): Array<{ login: string; count: number }> {
  const counts = new Map<string, number>();
  for (const login of logins) counts.set(login, (counts.get(login) ?? 0) + 1);
  return [...counts]
    .map(([login, count]) => ({ login, count }))
    .sort((a, b) => b.count - a.count || a.login.localeCompare(b.login));
}

/**
 * What each filter's choices would leave. Each menu counts under the other
 * filters but not its own, so its numbers say what picking a choice gives.
 */
export function openFacets(items: readonly OpenItem[], query: OpenQuery, now: number): OpenFacets {
  const without = (skip: Filter) => items.filter((item) => matches(item, query, now, skip));
  const byAssignee = without("assignee");
  const byState = without("state");
  return {
    authors: counted(without("author").flatMap((item) => (item.author === null ? [] : [item.author]))),
    assignees: counted(byAssignee.flatMap((item) => item.assignees)),
    nobody: byAssignee.filter((item) => item.assignees.length === 0).length,
    drafts: byState.filter((item) => item.isDraft).length,
    ready: byState.filter((item) => !item.isDraft).length,
    quiet: without("quiet").filter((item) => isQuiet(item, now)).length,
  };
}
