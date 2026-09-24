import { describe, expect, test } from "vitest";

import { describeActivity, describeDue } from "./due.js";

/** Thursday, September 24, 2026, mid-morning local time. */
const now = new Date(2026, 8, 24, 9, 30);

function due(date: string) {
  return describeDue({ date, recurring: false }, now);
}

describe("describeDue", () => {
  test("names the nearby days", () => {
    expect(due("2026-09-23")).toEqual({ text: "Yesterday", tone: "overdue" });
    expect(due("2026-09-24")).toEqual({ text: "Today", tone: "today" });
    expect(due("2026-09-25")).toEqual({ text: "Tomorrow", tone: "upcoming" });
  });

  test("names the weekday within the coming week", () => {
    expect(due("2026-09-29").text).toBe("Tuesday");
  });

  test("gives the calendar date further out, with the year only when it differs", () => {
    expect(due("2026-10-01").text).toBe("Oct 1");
    expect(due("2026-09-10")).toEqual({ text: "Sep 10", tone: "overdue" });
    expect(due("2027-01-15").text).toBe("Jan 15, 2027");
  });

  test("shows a floating time as written", () => {
    expect(due("2026-09-24T14:00:00").text).toBe("Today 14:00");
  });

  test("converts a time fixed to a timezone into local time", () => {
    const fixed = new Date(2026, 8, 25, 8, 15);
    expect(due(fixed.toISOString().replace(/\.\d{3}Z$/, "Z")).text).toBe("Tomorrow 08:15");
  });
});

describe("describeActivity", () => {
  test("gives the time today, then Yesterday, then the date", () => {
    expect(describeActivity(new Date(2026, 8, 24, 8, 4).toISOString(), now)).toBe("08:04");
    expect(describeActivity(new Date(2026, 8, 23, 20, 9).toISOString(), now)).toBe("Yesterday");
    expect(describeActivity(new Date(2026, 8, 20, 12, 0).toISOString(), now)).toBe("Sep 20");
    expect(describeActivity(new Date(2025, 11, 31, 12, 0).toISOString(), now)).toBe("Dec 31, 2025");
  });
});
