import { describe, expect, test } from "vitest";

import { groupIntoSections, isOverdue, NOW_GROUPS, nowGroupOf, overdueText, sectionOf, shortDate, sidebarCounts } from "./sections.js";
import type { Item } from "./types.js";

/** Thursday, September 24, 2026, 9:30 local. */
const now = new Date(2026, 8, 24, 9, 30);

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id, source: "todoist", title: id, description: "", priority: null, due: null, deadline: null,
    activityAt: null, context: null, tags: [], url: "https://example.com", gmail: null, github: null, ...overrides,
  };
}

const due = (date: string) => ({ due: { date, recurring: false } });

/** An instant `hours` before `now`, so mail ages hold in any timezone. */
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

const mail = (id: string, hours: number, unread = false) =>
  item(id, { gmail: { threadIds: [id], unread }, activityAt: hoursAgo(hours) });

describe("isOverdue", () => {
  test("counts a task dated before today, by its due date or deadline, whichever is sooner", () => {
    expect(isOverdue(item("a", due("2026-09-23")), now)).toBe(true);
    expect(isOverdue(item("a", due("2026-09-24")), now)).toBe(false);
    expect(isOverdue(item("a", { ...due("2026-09-30"), deadline: "2026-09-20" }), now)).toBe(true);
    expect(isOverdue(item("a"), now)).toBe(false);
  });

  test("counts a task due today once its time has passed", () => {
    expect(isOverdue(item("a", due("2026-09-24T08:00:00")), now)).toBe(true);
    expect(isOverdue(item("a", due("2026-09-24T09:30:00")), now)).toBe(false);
    expect(isOverdue(item("a", due("2026-09-24T14:00:00")), now)).toBe(false);
    expect(isOverdue(item("a", due(new Date(now.getTime() - 60 * 1000).toISOString())), now)).toBe(true);
    expect(isOverdue(item("a", due(new Date(now.getTime() + 60 * 1000).toISOString())), now)).toBe(false);
  });

  test("counts mail, read or unread, once its latest message is more than 48 hours old", () => {
    expect(isOverdue(mail("a", 47), now)).toBe(false);
    expect(isOverdue(mail("a", 48), now)).toBe(false);
    expect(isOverdue(mail("a", 49), now)).toBe(true);
    expect(isOverdue(mail("a", 49, true), now)).toBe(true);
  });
});

describe("nowGroupOf", () => {
  const github = (overrides: Partial<NonNullable<Item["github"]>>, unread = true) =>
    item("gh", {
      gmail: { threadIds: ["gh"], unread },
      activityAt: hoursAgo(2),
      github: { repo: "acme/widgets", number: 1, kind: "pull", state: "open", review: null, closedAs: null, reason: "mention", comment: null, ...overrides },
    });

  test("sorts tasks by date, with an undated Inbox task counted as today's", () => {
    expect(nowGroupOf(item("a", due("2026-09-23")), now)).toBe("overdue");
    expect(nowGroupOf(item("a", due("2026-09-24T08:00:00")), now)).toBe("overdue");
    expect(nowGroupOf(item("a", { inbox: true, ...due("2026-09-20") }), now)).toBe("overdue");
    expect(nowGroupOf(item("a", due("2026-09-24T14:00:00")), now)).toBe("today");
    expect(nowGroupOf(item("a", { deadline: "2026-09-24" }), now)).toBe("today");
    expect(nowGroupOf(item("a", { inbox: true }), now)).toBe("today");
    expect(nowGroupOf(item("a", due("2026-09-25")), now)).toBe("minor");
    expect(nowGroupOf(item("a", { inbox: true, ...due("2026-09-26") }), now)).toBe("minor");
  });

  test("sorts GitHub notifications by why they came, after anything left to archive", () => {
    expect(nowGroupOf(github({ reason: "author" }), now)).toBe("me");
    expect(nowGroupOf(github({ reason: "ci_activity" }), now)).toBe("me");
    expect(nowGroupOf(github({ reason: "review_requested", reviewRequested: "team", myReview: "requested" }), now)).toBe("requests");
    expect(nowGroupOf(github({ reason: "mention" }), now)).toBe("requests");
    expect(nowGroupOf(github({ reason: "team_mention" }), now)).toBe("requests");
    expect(nowGroupOf(github({ reason: "assign" }), now)).toBe("requests");
    expect(nowGroupOf(github({ reason: "subscribed" }), now)).toBe("minor");
    expect(nowGroupOf(github({ reason: "manual" }), now)).toBe("minor");
    expect(nowGroupOf(github({ reason: "comment" }), now)).toBe("minor");
    expect(nowGroupOf(github({ reason: "author", state: "merged" }), now)).toBe("archive");
    expect(nowGroupOf(github({ reason: "review_requested", reviewRequested: "others" }), now)).toBe("archive");
    expect(nowGroupOf(github({ reason: "review_requested", myReview: "approved" }), now)).toBe("archive");
  });

  test("puts email to you in Me, document comments by whether they mention you, and invitations by whether you answered", () => {
    expect(nowGroupOf(item("a", { gmail: { threadIds: ["a"], unread: true, toYou: true }, activityAt: hoursAgo(1) }), now)).toBe("me");
    expect(nowGroupOf(mail("a", 1, true), now)).toBe("requests");
    // Mail no longer counts as overdue for its age.
    expect(nowGroupOf(mail("a", 60), now)).toBe("requests");
    const doc = (mentioned: boolean) => item("d", { gmail: { threadIds: ["d"], unread: true }, activityAt: hoursAgo(1), doc: { app: "docs", documentId: "d", mentioned, quotes: [] } });
    expect(nowGroupOf(doc(true), now)).toBe("requests");
    expect(nowGroupOf(doc(false), now)).toBe("minor");
    const invite = (response: "needsAction" | "accepted") => item("i", { gmail: { threadIds: ["i"], unread: true }, activityAt: hoursAgo(1), invite: { eventId: "e", response, cancelled: false } });
    expect(nowGroupOf(invite("needsAction"), now)).toBe("requests");
    expect(nowGroupOf(invite("accepted"), now)).toBe("archive");
  });
});

describe("overdueText", () => {
  test("says how many days late a task is, and how many days old mail is", () => {
    expect(overdueText(item("a", due("2026-09-23")), now)).toBe("1 day late");
    expect(overdueText(item("a", due("2026-09-16")), now)).toBe("8 days late");
    expect(overdueText(item("a", { ...due("2026-09-23T14:00:00"), deadline: "2026-09-20" }), now)).toBe("4 days late");
    expect(overdueText(mail("a", 49), now)).toBe("2 days old");
    expect(overdueText(item("a", due("2026-09-24T09:10:00")), now)).toBe("20 minutes late");
    expect(overdueText(item("a", due("2026-09-24T09:29:00")), now)).toBe("1 minute late");
    expect(overdueText(item("a", due(new Date(now.getTime() - 10 * 1000).toISOString())), now)).toBe("1 minute late");
    expect(overdueText(item("a", due("2026-09-24T08:30:00")), now)).toBe("1 hour late");
    expect(overdueText(item("a", due("2026-09-24T06:00:00")), now)).toBe("3 hours late");
    expect(overdueText(mail("a", 100), now)).toBe("4 days old");
  });
});

describe("sectionOf", () => {
  test("puts every Gmail row and Todoist's Inbox in Now", () => {
    expect(sectionOf(item("a", { gmail: { threadIds: ["t1"], unread: true } }))).toBe("now");
    expect(sectionOf(item("a", { gmail: { threadIds: ["t1"], unread: false } }))).toBe("now");
    expect(sectionOf(item("a", { inbox: true }))).toBe("now");
  });

  test("puts a task with a due date or a deadline in Now, whenever it falls", () => {
    expect(sectionOf(item("a", due("2026-09-21")))).toBe("now");
    expect(sectionOf(item("a", due("2026-09-24T14:00:00")))).toBe("now");
    expect(sectionOf(item("a", due("2026-10-01")))).toBe("now");
    expect(sectionOf(item("a", { deadline: "2026-09-16" }))).toBe("now");
  });

  test("puts an undated task in Anytime", () => {
    expect(sectionOf(item("a"))).toBe("anytime");
  });
});

describe("groupIntoSections", () => {
  test("keeps every section, and orders Now run by run: overdue, today, me, requests, archive, minor", () => {
    const toYou = item("to-you", { gmail: { threadIds: ["to-you"], unread: false, toYou: true }, activityAt: hoursAgo(3) });
    const merged = item("merged", {
      gmail: { threadIds: ["merged"], unread: true },
      activityAt: hoursAgo(4),
      github: { repo: "acme/widgets", number: 2, kind: "pull", state: "merged", review: null, closedAs: null, reason: "author", comment: null },
    });
    const followed = item("followed", {
      gmail: { threadIds: ["followed"], unread: false },
      activityAt: hoursAgo(1),
      github: { repo: "acme/gadgets", number: 3, kind: "issue", state: "open", review: null, closedAs: null, reason: "subscribed", comment: null },
    });
    const sections = groupIntoSections(
      [
        item("today", due("2026-09-24T14:00:00")),
        item("this-morning", due("2026-09-24T08:00:00")),
        item("late", due("2026-09-21")),
        item("filed", { inbox: true }),
        mail("recent-mail", 5),
        mail("new-mail", 1, true),
        item("later", due("2026-09-30")),
        item("someday"),
        mail("stale-mail", 60),
        toYou,
        merged,
        followed,
      ],
      now,
    );
    expect(sections.map((section) => [section.title, section.items.map((kept) => kept.id)])).toEqual([
      [
        "Now",
        // Within a run, unread mail leads, then newest first; tasks keep the list's order, undated ones last.
        ["late", "this-morning", "today", "filed", "to-you", "new-mail", "recent-mail", "stale-mail", "merged", "followed", "later"],
      ],
      ["Anytime", ["someday"]],
    ]);
    expect(groupIntoSections([], now).map((section) => section.items.length)).toEqual([0, 0]);
  });

  test("puts undated Inbox tasks after today's dated ones, newest added first", () => {
    const today = groupIntoSections(
      [
        item("old", { inbox: true, createdAt: "2026-09-01T10:00:00.000000Z" }),
        item("dated", { inbox: true, ...due("2026-09-24") }),
        item("new", { inbox: true, createdAt: "2026-09-23T10:00:00.000000Z", priority: 3 }),
        item("urgent-but-older", { inbox: true, createdAt: "2026-09-10T10:00:00.000000Z", priority: 1 }),
        item("due-today", due("2026-09-24")),
      ],
      now,
    ).find((section) => section.id === "now")!;
    expect(today.items.map((kept) => kept.id)).toEqual(["dated", "due-today", "new", "urgent-but-older", "old"]);
  });

  test("agrees with nowGroupOf, so each run's rows sit together in NOW_GROUPS order", () => {
    const rows = [
      item("later", due("2026-09-26")), mail("read", 3), item("today", due("2026-09-24")),
      item("late", due("2026-09-20")), mail("stale", 60), mail("unread", 2, true), item("inbox", { inbox: true }),
    ];
    const order = NOW_GROUPS.map((group) => group.id);
    const runs = groupIntoSections(rows, now)[0]!.items.map((row) => order.indexOf(nowGroupOf(row, now)));
    expect(runs).toEqual([...runs].sort((a, b) => a - b));
  });
});


describe("shortDate", () => {
  test("gives the time today, Today without one, and the date otherwise", () => {
    expect(shortDate("2026-09-24T14:00:00", now)).toBe("14:00");
    expect(shortDate("2026-09-24", now)).toBe("Today");
    expect(shortDate("2026-09-21", now)).toBe("Sep 21");
    expect(shortDate("2027-01-15", now)).toBe("Jan 15, 2027");
    expect(shortDate(new Date(2026, 8, 24, 8, 4).toISOString(), now)).toBe("08:04");
    expect(shortDate(new Date(2026, 8, 23, 20, 9).toISOString(), now)).toBe("Sep 23");
  });

  test("keeps the time on another day when asked, as a recurring task's row does", () => {
    expect(shortDate("2026-09-28T14:00:00", now, { clock: true })).toBe("Sep 28 14:00");
    expect(shortDate("2027-01-04T09:00:00", now, { clock: true })).toBe("Jan 4, 2027 09:00");
    expect(shortDate("2026-09-24T14:00:00", now, { clock: true })).toBe("14:00");
    expect(shortDate("2026-09-28", now, { clock: true })).toBe("Sep 28");
  });
});

describe("sidebarCounts", () => {
  test("counts what needs a decision or is overdue, each once, and every row in the Now section as its tab does", () => {
    const items = [
      item("unread", { gmail: { threadIds: ["t1"], unread: true } }),
      item("read", { gmail: { threadIds: ["t2"], unread: false } }),
      item("inbox", { inbox: true }),
      item("overdue", due("2026-09-20")),
      item("later", due("2026-10-02")),
      item("undated"),
      mail("stale-read", 60),
      mail("stale-unread", 60, true),
    ];
    // unread, inbox, overdue, stale-read, and stale-unread (counted once).
    expect(sidebarCounts(items, now)).toEqual({ urgent: 5, now: 7 });
    expect(sidebarCounts(items, now).now).toBe(groupIntoSections(items, now)[0]!.items.length);
  });

  test("counts nothing in an empty list", () => {
    expect(sidebarCounts([], now)).toEqual({ urgent: 0, now: 0 });
  });
});
