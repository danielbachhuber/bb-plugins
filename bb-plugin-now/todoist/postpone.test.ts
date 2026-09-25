import { describe, expect, test } from "vitest";

import { addDays, canPostponeTo, movedDate, postponeChoices } from "./postpone.js";

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

  test("counts from today when the task is overdue, so no pick leaves it overdue", () => {
    const due = { date: "2026-09-21", recurring: true, text: "every mon" };
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
