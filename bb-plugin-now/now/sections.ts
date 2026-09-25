// The page's sections, and the short date each row shows. No I/O here.
import { localDay } from "./due.js";
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
  now: "Unread mail and Todoist's Inbox, then overdue tasks, today's tasks, read mail, and tasks dated later",
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
 * overdue tasks, today's tasks, the read mail newest first, and the tasks
 * dated later. Its other tasks and Anytime keep the list's order (soonest
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
  groups.set("now", [
    ...unreadMail,
    ...inboxTasks.filter((item) => sortDate(item) !== null),
    ...undated,
    ...tasks.filter((item) => dayOfTask(item) < today),
    ...tasks.filter((item) => dayOfTask(item) === today),
    ...readMail,
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

/**
 * The two counts beside the page's name in the sidebar: the rows that need a
 * decision (unread mail and Todoist's Inbox), and the rest of the Now section.
 * Anytime is in neither.
 */
export function sidebarCounts(items: readonly Item[]): { inbox: number; now: number } {
  let inbox = 0;
  let now = 0;
  for (const item of items) {
    if (needsDecision(item)) inbox++;
    else if (sectionOf(item) === "now") now++;
  }
  return { inbox, now };
}
