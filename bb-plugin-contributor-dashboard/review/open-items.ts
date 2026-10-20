// Everything open now, whatever the period: the lists the Issues and Pull
// requests headings open. Pure: reads stored GitHub objects, makes no calls.
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
}

interface Stored {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft?: boolean;
  createdAt: string;
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
    }));
}
