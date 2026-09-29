import { describe, expect, test } from "vitest";

import { isAtProposedTime, proposedTime, spanText, toEventField } from "./proposal.js";

const ics = (lines: string[]) =>
  ["BEGIN:VCALENDAR", "METHOD:COUNTER", "BEGIN:VEVENT", ...lines, "SUMMARY:Widget sync", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

describe("proposedTime", () => {
  test("reads a proposal's start and end in UTC", () => {
    expect(proposedTime(ics(["DTSTART:20261014T180000Z", "DTEND:20261014T190000Z"]))).toEqual({
      start: "2026-10-14T18:00:00.000Z",
      end: "2026-10-14T19:00:00.000Z",
    });
  });

  test("reads a time given in a named zone, and an all-day one", () => {
    expect(
      proposedTime(ics(["DTSTART;TZID=America/Los_Angeles:20261014T110000", "DTEND;TZID=America/Los_Angeles:20261207T120000"])),
    ).toEqual({ start: "2026-10-14T18:00:00.000Z", end: "2026-12-07T20:00:00.000Z" });
    expect(proposedTime(ics(["DTSTART;VALUE=DATE:20261014", "DTEND;VALUE=DATE:20261015"]))).toEqual({
      start: "2026-10-14",
      end: "2026-10-15",
    });
  });

  test("skips the time zone block and joins folded lines", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "METHOD:COUNTER",
      "BEGIN:VTIMEZONE",
      "BEGIN:DAYLIGHT",
      "DTSTART:19700308T020000",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "DTSTART:20261014T18",
      " 0000Z",
      "DTEND:20261014T190000Z",
      "END:VEVENT",
    ].join("\r\n");
    expect(proposedTime(text)?.start).toBe("2026-10-14T18:00:00.000Z");
  });

  test("is null for anything but a proposal", () => {
    expect(proposedTime(ics(["DTSTART:20261014T180000Z", "DTEND:20261014T190000Z"]).replace("COUNTER", "REQUEST"))).toBeNull();
    expect(proposedTime(ics(["DTSTART:20261014T180000Z"]))).toBeNull();
  });
});

describe("isAtProposedTime", () => {
  const proposed = { start: "2026-10-14T18:00:00.000Z", end: "2026-10-14T19:00:00.000Z" };

  test("compares instants, whatever offset Calendar writes them in", () => {
    expect(isAtProposedTime(proposed, { start: "2026-10-14T11:00:00-07:00", end: "2026-10-14T12:00:00-07:00" })).toBe(true);
    expect(isAtProposedTime(proposed, { start: "2026-10-14T11:30:00-07:00", end: "2026-10-14T12:00:00-07:00" })).toBe(false);
    expect(isAtProposedTime(proposed, null)).toBe(false);
  });
});

describe("toEventField", () => {
  test("keeps the event's time zone, and clears the other kind of time", () => {
    expect(toEventField("2026-10-14T18:00:00.000Z", { dateTime: "2026-10-14T11:30:00-07:00", timeZone: "America/Los_Angeles" })).toEqual({
      dateTime: "2026-10-14T18:00:00.000Z",
      timeZone: "America/Los_Angeles",
      date: null,
    });
    expect(toEventField("2026-10-14", { date: "2026-10-06" })).toEqual({ date: "2026-10-14", dateTime: null });
  });
});

describe("spanText", () => {
  const now = new Date(2026, 8, 29, 12);
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

  test("writes a span the way Calendar's emails do", () => {
    expect(spanText({ start: at(14, 11), end: at(14, 12) }, now)).toBe("Wed Oct 14, 11am – 12pm");
    expect(spanText({ start: at(14, 9, 30), end: at(14, 13) }, now)).toBe("Wed Oct 14, 9:30am – 1pm");
    expect(spanText({ start: "2026-10-14", end: "2026-10-15" }, now)).toBe("Wed Oct 14");
    expect(spanText({ start: "2027-01-06", end: "2027-01-07" }, now)).toBe("Wed Jan 6, 2027");
  });

  test("leaves the day out when it is the same as the other span's", () => {
    const proposed = { start: at(14, 11), end: at(14, 12) };
    expect(spanText({ start: at(14, 11, 30), end: at(14, 12) }, now, proposed)).toBe("11:30am – 12pm");
    expect(spanText({ start: at(15, 11, 30), end: at(15, 12) }, now, proposed)).toBe("Thu Oct 15, 11:30am – 12pm");
  });
});
