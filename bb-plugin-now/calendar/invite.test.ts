import { describe, expect, test } from "vitest";

import { attendeesWithReply, eventIdFromBody, inviteState, notificationKind } from "./invite.js";

describe("notificationKind", () => {
  test("tells an invitation from a cancellation and from someone else's reply", () => {
    expect(notificationKind("eventCreated")).toBe("invitation");
    expect(notificationKind("timeOrRecurrenceUpdated")).toBe("invitation");
    expect(notificationKind("descriptionUpdated")).toBe("invitation");
    expect(notificationKind("eventCancelled")).toBe("cancelled");
    expect(notificationKind("rsvpAccepted")).toBeNull();
    expect(notificationKind("rsvpDeclined,rsvpWithNote")).toBeNull();
    expect(notificationKind(null)).toBeNull();
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
    expect(inviteState(event)).toEqual({ response: "needsAction", cancelled: false });
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
