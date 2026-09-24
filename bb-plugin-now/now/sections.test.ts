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
  test("files a row by the date it sorts by", () => {
    expect(sectionOf(item("a", due("2026-09-21")), now)).toBe("overdue");
    expect(sectionOf(item("a", due("2026-09-24T14:00:00")), now)).toBe("today");
    expect(sectionOf(item("a", due("2026-09-25")), now)).toBe("upcoming");
    expect(sectionOf(item("a", { deadline: "2026-09-16" }), now)).toBe("overdue");
    expect(sectionOf(item("a", { ...due("2026-10-01"), deadline: "2026-09-24" }), now)).toBe("today");
  });

  test("puts an email in Inbox and an undated task in No date", () => {
    expect(sectionOf(item("a", { gmail: { threadIds: ["t1"], unread: false } }), now)).toBe("inbox");
    expect(sectionOf(item("a"), now)).toBe("undated");
  });
});

describe("groupIntoSections", () => {
  test("keeps the order within a section and leaves empty ones out", () => {
    const sections = groupIntoSections(
      [
        item("late", due("2026-09-20")),
        item("mail", { gmail: { threadIds: ["t1"], unread: false } }),
        item("later", due("2026-09-30")),
        item("later-still", due("2026-10-02")),
      ],
      now,
    );
    expect(sections.map((section) => [section.title, section.items.map((kept) => kept.id)])).toEqual([
      ["Overdue", ["late"]],
      ["Upcoming", ["later", "later-still"]],
      ["Inbox", ["mail"]],
    ]);
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
