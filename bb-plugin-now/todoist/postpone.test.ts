import { describe, expect, test } from "vitest";

import { addDays, canPostponeTo, movedDate, postponeChoices, postponeTarget } from "./postpone.js";

/** Thursday, September 24, 2026, 9:30 local. */
const now = new Date(2026, 8, 24, 9, 30);

describe("movedDate", () => {
  test("keeps a day a day, and a floating time its clock", () => {
    expect(movedDate("2026-09-28", "2026-09-29")).toBe("2026-09-29");
    expect(movedDate("2026-09-28T09:00:00", "2026-10-05")).toBe("2026-10-05T09:00:00");
  });

  test("keeps a fixed time's local clock across the move", () => {
    const fixed = new Date(2026, 8, 28, 9, 0).toISOString().replace(/\.\d{3}Z$/, "Z");
    const moved = movedDate(fixed, "2026-10-05");
    expect(moved.endsWith("Z")).toBe(true);
    const local = new Date(moved);
    expect([local.getFullYear(), local.getMonth(), local.getDate(), local.getHours()]).toEqual([2026, 9, 5, 9]);
  });
});

describe("postponeChoices", () => {
  test("counts from the due date when it is ahead", () => {
    const due = { date: "2026-09-28T09:00:00", recurring: true, text: "every mon 9am" };
    expect(postponeChoices(due, now).map((choice) => choice.day)).toEqual(["2026-09-29", "2026-09-30", "2026-10-05"]);
  });

  test("offers today first when the task is overdue, and counts the rest from today", () => {
    const due = { date: "2026-09-21", recurring: true, text: "every mon" };
    expect(postponeChoices(due, now)).toEqual([
      { label: "Today", day: "2026-09-24" },
      { label: "Tomorrow", day: "2026-09-25" },
      { label: "In a week", day: "2026-10-01" },
    ]);
  });

  test("does not offer today to a task already due today", () => {
    const due = { date: "2026-09-24", recurring: false };
    expect(postponeChoices(due, now).map((choice) => choice.day)).toEqual(["2026-09-25", "2026-09-26", "2026-10-01"]);
  });

  test("steps over the end of a month", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });
});

describe("canPostponeTo", () => {
  const due = { date: "2026-09-28T09:00:00", recurring: true, text: "every mon 9am" };

  test("takes a day after the due date, not the due date itself or one before it", () => {
    expect(canPostponeTo(due, "2026-09-29", now)).toBe(true);
    expect(canPostponeTo(due, "2026-09-28", now)).toBe(false);
    expect(canPostponeTo(due, "2026-09-26", now)).toBe(false);
  });

  test("moves an overdue task as far as today, but not into the past", () => {
    const overdue = { date: "2026-09-21", recurring: true, text: "every mon" };
    expect(canPostponeTo(overdue, "2026-09-24", now)).toBe(true);
    expect(canPostponeTo(overdue, "2026-09-23", now)).toBe(false);
  });
});

describe("postponeTarget", () => {
  const recurring = { date: "2026-09-28T09:00:00", recurring: true, text: "every mon 9am" };

  test("moves a recurring task's occurrence on any day, even with a deadline past", () => {
    expect(postponeTarget({ due: recurring, deadline: "2026-09-20" }, now)).toEqual({ kind: "occurrence", due: recurring });
  });

  test("moves a one-off due date that is today or past, and nothing while it is ahead", () => {
    const past = { date: "2026-09-22T14:00:00", recurring: false };
    const today = { date: "2026-09-24", recurring: false };
    expect(postponeTarget({ due: past, deadline: null }, now)).toEqual({ kind: "due", due: past });
    expect(postponeTarget({ due: today, deadline: null }, now)).toEqual({ kind: "due", due: today });
    expect(postponeTarget({ due: { date: "2026-09-25", recurring: false }, deadline: null }, now)).toBeNull();
  });

  test("moves a deadline that is today or past when the due date does not need it", () => {
    const deadline = { kind: "deadline", due: { date: "2026-09-20", recurring: false } };
    expect(postponeTarget({ due: null, deadline: "2026-09-20" }, now)).toEqual(deadline);
    expect(postponeTarget({ due: { date: "2026-10-01", recurring: false }, deadline: "2026-09-20" }, now)).toEqual(deadline);
    expect(postponeTarget({ due: null, deadline: "2026-09-30" }, now)).toBeNull();
  });

  test("offers nothing on a recurring task whose rule has no words to send back", () => {
    expect(postponeTarget({ due: { date: "2026-09-28", recurring: true }, deadline: null }, now)).toBeNull();
  });
});
