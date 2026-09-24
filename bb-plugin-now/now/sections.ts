// The page's sections, and the short date each row shows. No I/O here.
import { localDay } from "./due.js";
import { sortDate } from "./items.js";
import type { Item } from "./types.js";

export type SectionId = "overdue" | "today" | "upcoming" | "inbox" | "undated";

export interface Section {
  id: SectionId;
  title: string;
  items: Item[];
}

const TITLES: Record<SectionId, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  inbox: "Inbox",
  undated: "No date",
};

const ORDER: SectionId[] = ["overdue", "today", "upcoming", "inbox", "undated"];

/** The local day a date or date-time falls on; a trailing `Z` is converted. */
function dayOf(date: string): string {
  if (date.includes("T") && date.endsWith("Z")) return localDay(new Date(date));
  return date.slice(0, 10);
}

/**
 * Which section a row belongs in, by the date it sorts by (its due date or
 * its deadline, whichever is sooner). A row with no date is an email, which
 * goes in Inbox, or an undated task.
 */
export function sectionOf(item: Item, now: Date): SectionId {
  const date = sortDate(item);
  if (date === null) return item.gmail !== null ? "inbox" : "undated";
  const day = dayOf(date);
  const today = localDay(now);
  if (day < today) return "overdue";
  if (day === today) return "today";
  return "upcoming";
}

/** The rows grouped into sections, keeping their order; empty sections left out. */
export function groupIntoSections(items: readonly Item[], now: Date): Section[] {
  const groups = new Map<SectionId, Item[]>(ORDER.map((id) => [id, []]));
  for (const item of items) groups.get(sectionOf(item, now))!.push(item);
  return ORDER.filter((id) => groups.get(id)!.length > 0).map((id) => ({ id, title: TITLES[id], items: groups.get(id)! }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function time(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * One short form for every date on the page, which never wraps: the time for
 * something today when it has one, "Today" when it does not, and otherwise
 * the calendar date, with the year only when it is not this one.
 */
export function shortDate(date: string, now: Date): string {
  let day: string;
  let clock: string | null = null;
  if (date.includes("T")) {
    if (date.endsWith("Z")) {
      const instant = new Date(date);
      day = localDay(instant);
      clock = time(instant);
    } else {
      day = date.slice(0, 10);
      clock = date.slice(11, 16);
    }
  } else {
    day = date;
  }

  if (day === localDay(now)) return clock ?? "Today";
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  const text = `${MONTHS[month! - 1]} ${dayOfMonth}`;
  return year === now.getFullYear() ? text : `${text}, ${year}`;
}
