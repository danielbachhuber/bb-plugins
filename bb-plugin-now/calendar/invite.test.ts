import { describe, expect, test } from "vitest";

import { attendeesWithReply, eventIdFromBody, inviteState, isAcceptanceIcs, isGuestAcceptance, notificationKind } from "./invite.js";

describe("notificationKind", () => {
  test("tells an invitation from a cancellation and from someone else's reply", () => {
    expect(notificationKind("eventCreated")).toBe("invitation");
    expect(notificationKind("timeOrRecurrenceUpdated")).toBe("invitation");
    expect(notificationKind("descriptionUpdated")).toBe("invitation");
    expect(notificationKind("eventCancelled")).toBe("cancelled");
    expect(notificationKind("rsvpAccepted")).toBeNull();
    expect(notificationKind("rsvpDeclined,rsvpWithNote")).toBeNull();
    expect(notificationKind("rsvpTentative,rsvpWithNote,rsvpProposeNewTime")).toBe("proposal");
    expect(notificationKind(null)).toBeNull();
  });
});

describe("isGuestAcceptance", () => {
  test("counts a guest's plain acceptance and nothing else", () => {
    expect(isGuestAcceptance("rsvpAccepted")).toBe(true);
    expect(isGuestAcceptance("rsvpAccepted,rsvpWithNote")).toBe(true);
    expect(isGuestAcceptance("rsvpAccepted,rsvpProposeNewTime")).toBe(false);
    expect(isGuestAcceptance("rsvpDeclined")).toBe(false);
    expect(isGuestAcceptance("eventCreated")).toBe(false);
    expect(isGuestAcceptance(null)).toBe(false);
  });
});

describe("isAcceptanceIcs", () => {
  const ics = (method: string, partstat: string) =>
    ["BEGIN:VCALENDAR", `METHOD:${method}`, "BEGIN:VEVENT", `ATTENDEE;PARTSTAT=${partstat};CN=Octocat:mailto:octo`, " cat@example.com", "END:VEVENT", "END:VCALENDAR"].join("\r\n");

  test("counts a reply that accepts, and not one that declines or invites", () => {
    expect(isAcceptanceIcs(ics("REPLY", "ACCEPTED"))).toBe(true);
    expect(isAcceptanceIcs(ics("REPLY", "DECLINED"))).toBe(false);
    expect(isAcceptanceIcs(ics("REQUEST", "ACCEPTED"))).toBe(false);
  });
});

describe("eventIdFromBody", () => {
  test("reads the event id out of the eid in the email's links", () => {
    const eid = Buffer.from("evt123abc hubber@example.com").toString("base64url");
    expect(eventIdFromBody(`<a href="https://calendar.google.com/calendar/event?action=RESPOND&amp;eid=${eid}&amp;rst=1">Yes</a>`)).toBe(
      "evt123abc",
    );
    expect(eventIdFromBody("<p>No links here</p>")).toBeNull();
  });
});

describe("inviteState and attendeesWithReply", () => {
  const event = {
    status: "confirmed",
    attendees: [
      { email: "octocat@example.com", responseStatus: "accepted", organizer: true },
      { email: "hubber@example.com", responseStatus: "needsAction", self: true },
    ],
  };

  test("reads your reply, and whether the event was canceled", () => {
    expect(inviteState(event)).toEqual({ response: "needsAction", cancelled: false, time: null });
    expect(
      inviteState({ ...event, start: { dateTime: "2026-10-14T11:30:00-07:00" }, end: { dateTime: "2026-10-14T12:00:00-07:00" } }).time,
    ).toEqual({ start: "2026-10-14T11:30:00-07:00", end: "2026-10-14T12:00:00-07:00" });
    expect(inviteState({ ...event, status: "cancelled" }).cancelled).toBe(true);
    expect(inviteState({ attendees: [{ email: "octocat@example.com", self: false }] }).response).toBeNull();
  });

  test("changes only your entry, keeping every other guest as it came", () => {
    expect(attendeesWithReply(event, "tentative")).toEqual([
      { email: "octocat@example.com", responseStatus: "accepted", organizer: true },
      { email: "hubber@example.com", responseStatus: "tentative", self: true },
    ]);
    expect(attendeesWithReply({ attendees: [] }, "accepted")).toBeNull();
  });
});
