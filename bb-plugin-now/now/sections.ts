// The page's sections, and the short date each row shows. No I/O here.
import { localDay } from "./due.js";
import { sortDate } from "./items.js";
import type { Item } from "./types.js";

export type SectionId = "inbox" | "now" | "anytime";

export interface Section {
  id: SectionId;
  title: string;
  /** One line on what belongs here, for the header. */
  hint: string;
  items: Item[];
}

const TITLES: Record<SectionId, string> = { inbox: "Inbox", now: "Now", anytime: "Anytime" };

const HINTS: Record<SectionId, string> = {
  inbox: "Needs a decision: unread mail and Todoist's Inbox",
  now: "Tasks overdue or due today, and read mail still in the inbox",
  anytime: "Every other task",
};

export const SECTION_ORDER: readonly SectionId[] = ["now", "inbox", "anytime"];

/** The local day a date or date-time falls on; a trailing `Z` is converted. */
function dayOf(date: string): string {
  if (date.includes("T") && date.endsWith("Z")) return localDay(new Date(date));
  return date.slice(0, 10);
}

/**
 * Which section a row belongs in, from what it is rather than how urgent it
 * looks:
 *
 * - Inbox: everything that needs a decision before it is work. Unread Gmail
 *   rows (email, GitHub notifications, document comments, invitations), and
 *   tasks in Todoist's Inbox, whatever their date, since they have not been
 *   filed.
 * - Now: read Gmail rows, since a thread read but left in the inbox is one
 *   kept there to act on; and every other task that is overdue or due today,
 *   by the date it sorts by (its due date or its deadline, whichever is
 *   sooner).
 * - Anytime: every other task, dated later or not at all.
 */
export function sectionOf(item: Item, now: Date): SectionId {
  if (item.gmail !== null) return item.gmail.unread ? "inbox" : "now";
  if (item.inbox === true) return "inbox";
  const date = sortDate(item);
  if (date !== null && dayOf(date) <= localDay(now)) return "now";
  return "anytime";
}

/**
 * The rows grouped into sections, every section kept even when empty so the
 * header can count it. Now and Anytime keep the list's order (soonest first,
 * then priority, undated last), with Now's read mail after its tasks, newest
 * first. Inbox's mail is newest first, as Gmail is, with
 * Todoist's Inbox tasks after the mail: dated ones soonest first, then
 * undated ones newest added first.
 */
export function groupIntoSections(items: readonly Item[], now: Date): Section[] {
  const groups = new Map<SectionId, Item[]>(SECTION_ORDER.map((id) => [id, []]));
  for (const item of items) groups.get(sectionOf(item, now))!.push(item);
  const inbox = groups.get("inbox")!;
  const newestFirst = (a: string | null | undefined, b: string | null | undefined) => (b ?? "").localeCompare(a ?? "");
  const current = groups.get("now")!;
  const readMail = current.filter((item) => item.gmail !== null).sort((a, b) => newestFirst(a.activityAt, b.activityAt));
  groups.set("now", [...current.filter((item) => item.gmail === null), ...readMail]);
  const mail = inbox.filter((item) => item.gmail !== null).sort((a, b) => newestFirst(a.activityAt, b.activityAt));
  const tasks = inbox.filter((item) => item.gmail === null);
  // Dated tasks keep the list's order; undated ones, which it can only order by priority, go newest added first.
  const undated = tasks.filter((item) => sortDate(item) === null).sort((a, b) => newestFirst(a.createdAt, b.createdAt));
  groups.set("inbox", [...mail, ...tasks.filter((item) => sortDate(item) !== null), ...undated]);
  return SECTION_ORDER.map((id) => ({ id, title: TITLES[id], hint: HINTS[id], items: groups.get(id)! }));
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
