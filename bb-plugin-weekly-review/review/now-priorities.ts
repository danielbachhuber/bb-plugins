/**
 * The week's priorities as the Now plugin stores them, and Now's checks read
 * back onto this page's list. Pure; `now-client.ts` does the calling.
 */
import type { PriorityDetail } from "./priorities.js";
import type { PriorityView } from "./workstream-service.js";
import type { TableRow } from "./workstreams.js";

export interface NowPriority {
  text: string;
  details: PriorityDetail[];
  /** Null when nothing measures it: no linked workstream, or activity with no hours. */
  hours: number | null;
}

/**
 * Each priority with the hours its linked workstreams have had this week. A
 * linked priority with no activity at all is 0, which Now shows as no time
 * yet. One whose workstreams had activity but no hours, such as pull requests
 * only, is null rather than 0, so Now does not say it got no time.
 */
export function prioritiesForNow(
  priorities: ReadonlyArray<Pick<PriorityView, "text" | "details" | "links">>,
  rows: ReadonlyArray<Pick<TableRow, "workstreamId" | "total">>,
): NowPriority[] {
  const byId = new Map(rows.flatMap((row) => (row.workstreamId === null ? [] : [[row.workstreamId, row.total] as const])));
  return priorities.map((priority) => {
    const base = { text: priority.text, details: priority.details.map((detail) => ({ ...detail })) };
    if (priority.links.length === 0) return { ...base, hours: null };
    const totals = priority.links.flatMap((id) => {
      const total = byId.get(id);
      return total === undefined ? [] : [total];
    });
    const hours = Math.round(totals.reduce((sum, total) => sum + total.hours, 0) * 100) / 100;
    const active = totals.some((total) => total.keys.length > 0);
    return { ...base, hours: hours === 0 && active ? null : hours };
  });
}

/** The page's priorities, each marked done when Now has it checked. Null `done` means Now could not be asked. */
export function markDone<T extends { text: string }>(
  priorities: { heading: string; items: T[] } | null,
  done: ReadonlySet<string> | null,
): { heading: string; items: Array<T & { done: boolean }> } | null {
  if (priorities === null) return null;
  return {
    ...priorities,
    items: priorities.items.map((item) => ({ ...item, done: done?.has(item.text) === true })),
  };
}
