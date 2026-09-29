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
  now: "Overdue and today's tasks, what is yours, what asks for you, what can be archived, and what is minor",
  anytime: "Tasks with no date",
};

export const SECTION_ORDER: readonly SectionId[] = ["now", "anytime"];

/** The local day a date or date-time falls on; a trailing `Z` is converted. */
function dayOf(date: string): string {
  if (date.includes("T") && date.endsWith("Z")) return localDay(new Date(date));
  return date.slice(0, 10);
}

/**
 * The instant a date-time names, or null for a date with no time. A trailing
 * `Z` fixes it to a timezone; without one the time is local ("floating").
 */
function instantOf(date: string): number | null {
  if (!date.includes("T")) return null;
  if (date.endsWith("Z")) return Date.parse(date);
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const [hours, minutes] = date.slice(11, 16).split(":").map(Number);
  return new Date(year!, month! - 1, day!, hours!, minutes!).getTime();
}

/** How long a Gmail row can wait in the inbox before it counts as overdue. */
export const MAIL_OVERDUE_MS = 48 * 60 * 60 * 1000;

/**
 * Whether a row is overdue: a task whose date (due or deadline, whichever is
 * sooner) is a day already past, or is today at a time already past, or a
 * Gmail row, read or unread, whose latest message is more than 48 hours old.
 */
export function isOverdue(item: Item, now: Date): boolean {
  if (item.gmail !== null) {
    return item.activityAt !== null && now.getTime() - Date.parse(item.activityAt) > MAIL_OVERDUE_MS;
  }
  const date = sortDate(item);
  if (date === null) return false;
  const instant = instantOf(date);
  return dayOf(date) < localDay(now) || (instant !== null && instant < now.getTime());
}

/**
 * How far past due an overdue row is, in place of its date: "1 day late" or
 * "8 days late" for a task, by the day it sorts by, or "3 hours late" or
 * "20 minutes late" for one whose time passed earlier today, and "3 days old"
 * for mail, by whole days since its latest message.
 */
export function overdueText(item: Item, now: Date): string {
  if (item.gmail !== null) {
    const days = Math.floor((now.getTime() - Date.parse(item.activityAt!)) / (24 * 60 * 60 * 1000));
    return `${days} ${days === 1 ? "day" : "days"} old`;
  }
  const date = sortDate(item)!;
  const days = daysBetween(dayOf(date), localDay(now));
  if (days === 0) {
    // At least a minute, so a task due moments ago does not read "0 minutes late".
    const minutes = Math.max(1, Math.floor((now.getTime() - instantOf(date)!) / (60 * 1000)));
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} late`;
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hour" : "hours"} late`;
  }
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
 * Why a Gmail row can be archived, or null when it still wants something of
 * you: a merged or closed pull request, or a closed issue, has nothing left to
 * do, and neither does one whose review you have given and nobody has asked
 * for again, or one you hear about only because someone else, or a team you
 * are not on, was asked to review it. An invitation you have answered, or
 * one that was canceled, is done too.
 */
export function archiveReason(item: Item): string | null {
  const github = item.github;
  if (item.gmail === null) return null;
  if (item.invite?.cancelled === true) return "it's canceled";
  if (item.invite?.response === "accepted" || item.invite?.response === "declined" || item.invite?.response === "tentative") {
    return "you replied";
  }
  if (github === null) return null;
  if (github.state === "merged" || github.state === "closed") return `it's ${github.state}`;
  if (github.myReview != null && github.myReview !== "requested" && github.myReview !== "re-requested") return "you reviewed";
  if (github.reason === "review_requested" && github.reviewRequested === "others") return "not your review";
  return null;
}

/**
 * The runs the Now section is ordered in, which its summary counts and filters
 * by. Each row is in exactly one.
 */
export type NowGroupId = "overdue" | "today" | "me" | "requests" | "archive" | "minor";

export const NOW_GROUPS: readonly { id: NowGroupId; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "me", label: "Me" },
  { id: "requests", label: "Requests" },
  { id: "archive", label: "Archive" },
  { id: "minor", label: "Minor" },
];

/** GitHub's notification reasons that ask something of you by name or by team. */
const REQUEST_REASONS = new Set(["review_requested", "approval_requested", "mention", "team_mention", "assign", "security_alert"]);

/** GitHub's notification reasons about your own work. */
const ME_REASONS = new Set(["author", "ci_activity", "your_activity"]);

/**
 * Which of the Now section's runs a row in it belongs to:
 *
 * - Overdue: a task whose day or time has passed.
 * - Today: a task due today, or one in Todoist's Inbox with no date, since
 *   filing it is today's job.
 * - Me: activity on your own pull requests and issues, and email with you in
 *   its To field.
 * - Requests: what asks something of you: a review, a mention, an
 *   assignment, a document comment that mentions you, an invitation to
 *   answer, and any other email.
 * - Archive: a row with nothing left to do (see `archiveReason`).
 * - Minor: what you only follow, such as a subscription or a comment on
 *   someone else's item or document, and tasks dated after today.
 */
export function nowGroupOf(item: Item, now: Date): NowGroupId {
  if (item.gmail === null) {
    if (isOverdue(item, now)) return "overdue";
    const date = sortDate(item);
    return date === null || dayOf(date) === localDay(now) ? "today" : "minor";
  }
  if (archiveReason(item) !== null) return "archive";
  if (item.github !== null) {
    const reason = item.github.reason ?? "";
    if (ME_REASONS.has(reason)) return "me";
    return REQUEST_REASONS.has(reason) ? "requests" : "minor";
  }
  if (item.doc != null) return item.doc.mentioned ? "requests" : "minor";
  if (item.invite != null) return "requests";
  return item.gmail.toYou === true ? "me" : "requests";
}

/**
 * The rows grouped into sections, every section kept even when empty so the
 * header can count it. Now goes run by run, in `NOW_GROUPS` order. Within a
 * run, mail comes first, unread and then newest first; then dated tasks,
 * oldest day first and most urgent first within a day, so the most overdue
 * leads; then undated Inbox tasks, newest added first. Anytime keeps the
 * list's order.
 */
export function groupIntoSections(items: readonly Item[], now: Date): Section[] {
  const groups = new Map<SectionId, Item[]>(SECTION_ORDER.map((id) => [id, []]));
  for (const item of items) groups.get(sectionOf(item))!.push(item);
  const newestFirst = (a: string | null | undefined, b: string | null | undefined) => (b ?? "").localeCompare(a ?? "");
  const runs = new Map<NowGroupId, Item[]>(NOW_GROUPS.map((group) => [group.id, []]));
  for (const item of groups.get("now")!) runs.get(nowGroupOf(item, now))!.push(item);
  const byRun = (run: Item[]) => {
    const mail = run
      .filter((item) => item.gmail !== null)
      .sort((a, b) => Number(b.gmail!.unread) - Number(a.gmail!.unread) || newestFirst(a.activityAt, b.activityAt));
    const tasks = run.filter((item) => item.gmail === null);
    // Undated tasks, which the list can only order by priority, go newest added first.
    const undated = tasks.filter((item) => sortDate(item) === null).sort((a, b) => newestFirst(a.createdAt, b.createdAt));
    // Dated tasks go oldest day first; within a day they keep the list's order.
    const dated = tasks.filter((item) => sortDate(item) !== null).sort((a, b) => dayOf(sortDate(a)!).localeCompare(dayOf(sortDate(b)!)));
    return [...mail, ...dated, ...undated];
  };
  groups.set("now", NOW_GROUPS.flatMap((group) => byRun(runs.get(group.id)!)));
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
 * The two counts beside the page's name in the sidebar: the Overdue run, and
 * every row in the Now section, the same number as its tab. The first is part
 * of the second.
 */
export function sidebarCounts(items: readonly Item[], now: Date): { overdue: number; now: number } {
  const counts = { overdue: 0, now: 0 };
  for (const item of items) {
    if (sectionOf(item) !== "now") continue;
    counts.now++;
    if (nowGroupOf(item, now) === "overdue") counts.overdue++;
  }
  return counts;
}
