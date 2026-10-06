import { describe, expect, test } from "vitest";

import {
  clampColumnWidth,
  doneCount,
  hoursAsOf,
  hoursLabel,
  mergeDone,
  mondayOf,
  priorityWeekSchema,
  weekLabel,
  type StoredPriority,
} from "./priorities.js";

function stored(text: string, doneAt: string | null = null): StoredPriority {
  return { text, details: [], hours: null, doneAt };
}

describe("mondayOf", () => {
  test("is the same day on a Monday", () => {
    expect(mondayOf(new Date(2026, 9, 5, 9))).toBe("2026-10-05");
  });

  test("goes back to Monday from later in the week", () => {
    expect(mondayOf(new Date(2026, 9, 10, 23, 30))).toBe("2026-10-05");
  });

  test("treats Sunday as the end of the week, not the start", () => {
    expect(mondayOf(new Date(2026, 9, 11, 8))).toBe("2026-10-05");
  });

  test("crosses a month", () => {
    expect(mondayOf(new Date(2026, 9, 1))).toBe("2026-09-28");
  });
});

describe("mergeDone", () => {
  test("keeps a checked priority checked when its text is unchanged", () => {
    const merged = mergeDone(
      [stored("Ship the widget export", "2026-10-06T10:00:00.000Z"), stored("Plan the fall talk series")],
      [
        { text: "Ship the widget export", details: [], hours: 6.5 },
        { text: "Plan the fall talk series", details: [{ text: "Ask hubber", depth: 1 }], hours: 0 },
      ],
    );
    expect(merged).toEqual([
      { text: "Ship the widget export", details: [], hours: 6.5, doneAt: "2026-10-06T10:00:00.000Z" },
      { text: "Plan the fall talk series", details: [{ text: "Ask hubber", depth: 1 }], hours: 0, doneAt: null },
    ]);
  });

  test("brings a reworded priority back unchecked", () => {
    const merged = mergeDone(
      [stored("Ship the widget export", "2026-10-06T10:00:00.000Z")],
      [{ text: "Ship the widget export to CSV", details: [], hours: null }],
    );
    expect(merged[0]!.doneAt).toBeNull();
  });

  test("matches text ignoring surrounding space", () => {
    const merged = mergeDone(
      [stored("People", "2026-10-06T10:00:00.000Z")],
      [{ text: "  People ", details: [], hours: null }],
    );
    expect(merged[0]).toMatchObject({ text: "People", doneAt: "2026-10-06T10:00:00.000Z" });
  });

  test("follows the new order", () => {
    const merged = mergeDone(
      [stored("One"), stored("Two", "2026-10-06T10:00:00.000Z")],
      [
        { text: "Two", details: [], hours: null },
        { text: "One", details: [], hours: null },
      ],
    );
    expect(merged.map((each) => [each.text, each.doneAt !== null])).toEqual([
      ["Two", true],
      ["One", false],
    ]);
  });
});

test("doneCount counts checked priorities", () => {
  expect(doneCount([stored("One", "2026-10-06T10:00:00.000Z"), stored("Two")])).toBe(1);
});

describe("labels", () => {
  test("hoursLabel", () => {
    expect(hoursLabel(null)).toBeNull();
    expect(hoursLabel(0)).toBe("No time yet");
    expect(hoursLabel(6.5)).toBe("6.5h");
    expect(hoursLabel(1.25)).toBe("1.3h");
  });

  test("hoursAsOf says the time today, and the weekday otherwise", () => {
    const now = new Date(2026, 9, 6, 15, 0);
    expect(hoursAsOf(null, now)).toBeNull();
    expect(hoursAsOf(new Date(2026, 9, 6, 13, 5).toISOString(), now)).toBe("hours as of 1:05 PM");
    expect(hoursAsOf(new Date(2026, 9, 5, 7, 0).toISOString(), now)).toBe("hours as of Mon 7:00 AM");
  });

  test("weekLabel", () => {
    expect(weekLabel("2026-10-05")).toBe("Week of Oct 5");
  });
});

test("a list stored with bare-string details reads them as one level deep", () => {
  const week = priorityWeekSchema.parse({
    monday: "2026-10-05",
    source: "weekly-review",
    heading: null,
    hoursAt: null,
    writtenAt: "2026-10-06T13:00:00.000Z",
    items: [{ text: "People", details: ["1:1 prep for octocat"], hours: null, doneAt: null }],
  });
  expect(week.items[0]!.details).toEqual([{ text: "1:1 prep for octocat", depth: 1 }]);
});

test("clampColumnWidth keeps the column within its bounds", () => {
  expect(clampColumnWidth(300.4)).toBe(300);
  expect(clampColumnWidth("320")).toBe(320);
  expect(clampColumnWidth(40)).toBe(192);
  expect(clampColumnWidth(4000)).toBe(520);
  expect(clampColumnWidth(null)).toBe(256);
  expect(clampColumnWidth("wide")).toBe(256);
});
