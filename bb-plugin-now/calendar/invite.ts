// Google Calendar invitations: which event an invitation email is about, and
// your reply to it. No I/O here; api.ts asks Calendar.
//
// An invitation arrives from Calendar with an `X-Google-Calendar-Notification`
// header, and its body links to the event with an `eid`: the event's id and
// the invited address, base64url-encoded together ("abc123 you@example.com").

export type InviteResponse = "accepted" | "declined" | "tentative" | "needsAction";
export type Reply = Exclude<InviteResponse, "needsAction">;

export interface InviteState {
  /** Your reply, or null when you are not one of its guests (as its organizer, say). */
  response: InviteResponse | null;
  cancelled: boolean;
}

export const CALENDAR_HEADER = "X-Google-Calendar-Notification";

/**
 * What a notification's header says it is. The value is a comma-separated
 * list: `eventCreated` for a new invitation, `timeOrRecurrenceUpdated`,
 * `descriptionUpdated`, and the like for a changed one, `eventCancelled`, or
 * `rsvpAccepted` and its kin for someone else's reply, which asks nothing of
 * you.
 */
export function notificationKind(header: string | null): "invitation" | "cancelled" | null {
  const kinds = (header ?? "").split(",").map((kind) => kind.trim());
  if (kinds.includes("eventCancelled")) return "cancelled";
  if (kinds.some((kind) => kind === "eventCreated" || /Updated$/.test(kind))) return "invitation";
  return null;
}

/** The event an invitation's body links to, from the first `eid` in it. */
export function eventIdFromBody(body: string): string | null {
  const match = body.match(/[?&](?:amp;)?eid=([A-Za-z0-9_-]+)/);
  if (match === null) return null;
  const decoded = Buffer.from(match[1]!, "base64url").toString("utf8");
  const id = decoded.split(" ")[0]?.trim();
  return id && /^[A-Za-z0-9_]+$/.test(id) ? id : null;
}

type Attendee = { self?: unknown; responseStatus?: unknown };
type CalendarEvent = { status?: unknown; attendees?: unknown };

function attendeesOf(event: CalendarEvent): Attendee[] {
  return Array.isArray(event.attendees) ? event.attendees.filter((each) => typeof each === "object" && each !== null) : [];
}

const RESPONSES = new Set<unknown>(["accepted", "declined", "tentative", "needsAction"]);

/** Your reply to an event, from Calendar's `events get`. */
export function inviteState(event: CalendarEvent): InviteState {
  const self = attendeesOf(event).find((attendee) => attendee.self === true);
  const response = self !== undefined && RESPONSES.has(self.responseStatus) ? (self.responseStatus as InviteResponse) : null;
  return { response, cancelled: event.status === "cancelled" };
}

/**
 * The attendee list to send back with your reply changed. Calendar replaces
 * the whole list on a patch, so every other guest goes back as it came.
 * Null when you are not a guest, so there is nothing to reply as.
 */
export function attendeesWithReply(event: CalendarEvent, reply: Reply): Attendee[] | null {
  const attendees = attendeesOf(event);
  if (!attendees.some((attendee) => attendee.self === true)) return null;
  return attendees.map((attendee) => (attendee.self === true ? { ...attendee, responseStatus: reply } : attendee));
}
