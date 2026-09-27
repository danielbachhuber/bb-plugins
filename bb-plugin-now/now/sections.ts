// The page's sections, and the short date each row shows. No I/O here.
import { daysBetween, localDay } from "./due.js";
import { sortDate } from "./items.js";
import type { Item } from "./types.js";

export type SectionId = "now" | "anytime";

export interface Section {
  id: SectionId;
  title: string;
  /** One line on what belongs here, for the header. */
  hint: string;
  items: Item[];
}

const TITLES: Record<SectionId, string> = { now: "Now", anytime: "Anytime" };

const HINTS: Record<SectionId, string> = {
  now: "Unread mail and Todoist's Inbox, then overdue tasks and mail over two days old, today's tasks, recent read mail, and tasks dated later",
  anytime: "Tasks with no date",
};

export const SECTION_ORDER: readonly SectionId[] = ["now", "anytime"];

/** The local day a date or date-time falls on; a trailing `Z` is converted. */
function dayOf(date: string): string {
  if (date.includes("T") && date.endsWith("Z")) return localDay(new Date(date));
  return date.slice(0, 10);
}

/**
 * Whether a row needs a decision before it is work: an unread Gmail row
 * (email, GitHub notification, document comment, invitation), or a task in
 * Todoist's Inbox, whatever its date, since it has not been filed.
 */
export function needsDecision(item: Item): boolean {
  return item.gmail !== null ? item.gmail.unread : item.inbox === true;
}

/** How long a Gmail row can wait in the inbox before it counts as overdue. */
export const MAIL_OVERDUE_MS = 48 * 60 * 60 * 1000;

/**
 * Whether a row is overdue: a task whose date (due or deadline, whichever is
 * sooner) is a day already past, or a Gmail row, read or unread, whose latest
 * message is more than 48 hours old.
 */
export function isOverdue(item: Item, now: Date): boolean {
  if (item.gmail !== null) {
    return item.activityAt !== null && now.getTime() - Date.parse(item.activityAt) > MAIL_OVERDUE_MS;
  }
  const date = sortDate(item);
  return date !== null && dayOf(date) < localDay(now);
}

/**
 * How far past due an overdue row is, in place of its date: "1 day late" or
 * "8 days late" for a task, by the day it sorts by, and "3 days old" for
 * mail, by whole days since its latest message.
 */
export function overdueText(item: Item, now: Date): string {
  if (item.gmail !== null) {
    const days = Math.floor((now.getTime() - Date.parse(item.activityAt!)) / (24 * 60 * 60 * 1000));
    return `${days} ${days === 1 ? "day" : "days"} old`;
  }
  const days = daysBetween(dayOf(sortDate(item)!), localDay(now));
  return `${days} ${days === 1 ? "day" : "days"} late`;
}

/**
 * Which section a row belongs in, from what it is rather than how urgent it
 * looks:
 *
 * - Now: every Gmail row, since a thread read but left in the inbox is one
 *   kept there to act on; every task in Todoist's Inbox; and every other task
 *   with a date, by the date it sorts by (its due date or its deadline,
 *   whichever is sooner).
 * - Anytime: every other task, which has no date.
 */
export function sectionOf(item: Item): SectionId {
  if (item.gmail !== null || item.inbox === true) return "now";
  return sortDate(item) === null ? "anytime" : "now";
}

/**
 * The rows grouped into sections, every section kept even when empty so the
 * header can count it. Now leads with what needs a decision: unread mail
 * newest first, as Gmail has it, then Todoist's Inbox tasks, dated ones
 * soonest first and then undated ones newest added first. After those come
 * overdue rows (past-dated tasks and read mail more than 48 hours old, oldest
 * day first), today's tasks, the rest of the read mail newest first, and the
 * tasks dated later. Its other tasks and Anytime keep the list's order (soonest
 * first, then priority).
 */
export function groupIntoSections(items: readonly Item[], now: Date): Section[] {
  const groups = new Map<SectionId, Item[]>(SECTION_ORDER.map((id) => [id, []]));
  for (const item of items) groups.get(sectionOf(item))!.push(item);
  const newestFirst = (a: string | null | undefined, b: string | null | undefined) => (b ?? "").localeCompare(a ?? "");
  const current = groups.get("now")!;
  const inbox = current.filter(needsDecision);
  const rest = current.filter((item) => !needsDecision(item));
  const unreadMail = inbox.filter((item) => item.gmail !== null).sort((a, b) => newestFirst(a.activityAt, b.activityAt));
  const inboxTasks = inbox.filter((item) => item.gmail === null);
  // Dated tasks keep the list's order; undated ones, which it can only order by priority, go newest added first.
  const undated = inboxTasks.filter((item) => sortDate(item) === null).sort((a, b) => newestFirst(a.createdAt, b.createdAt));
  const readMail = rest.filter((item) => item.gmail !== null).sort((a, b) => newestFirst(a.activityAt, b.activityAt));
  const today = localDay(now);
  const tasks = rest.filter((item) => item.gmail === null);
  const dayOfTask = (item: Item) => dayOf(sortDate(item)!);
  // Overdue tasks and stale mail share one run, oldest day first; within a day the tasks keep the list's order.
  const overdue = [...tasks.filter((item) => dayOfTask(item) < today), ...readMail.filter((item) => isOverdue(item, now))]
    .map((item) => ({ item, day: item.gmail === null ? dayOfTask(item) : dayOf(item.activityAt!) }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(({ item }) => item);
  groups.set("now", [
    ...unreadMail,
    ...inboxTasks.filter((item) => sortDate(item) !== null),
    ...undated,
    ...overdue,
    ...tasks.filter((item) => dayOfTask(item) === today),
    ...readMail.filter((item) => !isOverdue(item, now)),
    ...tasks.filter((item) => dayOfTask(item) > today),
  ]);
  return SECTION_ORDER.map((id) => ({ id, title: TITLES[id], hint: HINTS[id], items: groups.get(id)! }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function time(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * One short form for every date on the page, which never wraps: the time for
 * something today when it has one, "Today" when it does not, and otherwise
 * the calendar date, with the year only when it is not this one. With
 * `clock`, a date on another day keeps its time after it too.
 */
export function shortDate(date: string, now: Date, { clock: withClock = false } = {}): string {
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
  const dated = year === now.getFullYear() ? text : `${text}, ${year}`;
  return withClock && clock !== null ? `${dated} ${clock}` : dated;
}

/**
 * The two counts beside the page's name in the sidebar: what needs a
 * decision (unread mail and Todoist's Inbox) or is overdue, each row once,
 * and every row in the Now section, the same number as its tab. The first is
 * part of the second.
 */
export function sidebarCounts(items: readonly Item[], now: Date): { urgent: number; now: number } {
  let urgent = 0;
  let current = 0;
  for (const item of items) {
    if (needsDecision(item) || isOverdue(item, now)) urgent++;
    if (sectionOf(item) === "now") current++;
  }
  return { urgent, now: current };
}
