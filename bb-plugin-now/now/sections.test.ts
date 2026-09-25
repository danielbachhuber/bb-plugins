import { describe, expect, test } from "vitest";

import { groupIntoSections, sectionOf, shortDate } from "./sections.js";
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
  test("keeps every section, and orders Now unread mail, Todoist's Inbox, overdue, today, read mail, later", () => {
    const sections = groupIntoSections(
      [
        item("today", due("2026-09-24T14:00:00")),
        item("late", due("2026-09-20")),
        item("filed", { inbox: true }),
        item("old-mail", { gmail: { threadIds: ["t1"], unread: false }, activityAt: "2026-09-22T10:00:00.000Z" }),
        item("new-mail", { gmail: { threadIds: ["t2"], unread: true }, activityAt: "2026-09-24T08:00:00.000Z" }),
        item("later", due("2026-09-30")),
        item("someday"),
        item("older-read", { gmail: { threadIds: ["t3"], unread: false }, activityAt: "2026-09-21T10:00:00.000Z" }),
        item("unread-older", { gmail: { threadIds: ["t4"], unread: true }, activityAt: "2026-09-23T08:00:00.000Z" }),
      ],
      now,
    );
    expect(sections.map((section) => [section.title, section.items.map((kept) => kept.id)])).toEqual([
      ["Now", ["new-mail", "unread-older", "filed", "late", "today", "old-mail", "older-read", "later"]],
      ["Anytime", ["someday"]],
    ]);
    expect(groupIntoSections([], now).map((section) => section.items.length)).toEqual([0, 0]);
  });

  test("orders Todoist's Inbox by date, then the undated tasks newest added first, ahead of other tasks", () => {
    const inbox = groupIntoSections(
      [
        item("old", { inbox: true, createdAt: "2026-09-01T10:00:00.000000Z" }),
        item("dated", { inbox: true, ...due("2026-09-30") }),
        item("new", { inbox: true, createdAt: "2026-09-23T10:00:00.000000Z", priority: 3 }),
        item("urgent-but-older", { inbox: true, createdAt: "2026-09-10T10:00:00.000000Z", priority: 1 }),
        item("overdue", due("2026-09-01")),
      ],
      now,
    ).find((section) => section.id === "now")!;
    expect(inbox.items.map((kept) => kept.id)).toEqual(["dated", "new", "urgent-but-older", "old", "overdue"]);
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
});
