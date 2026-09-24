// The only module that asks Google Calendar anything, through gws.
import { runJson, type GwsRunner } from "../gmail/gws.js";
import { attendeesWithReply, inviteState, type InviteState, type Reply } from "./invite.js";

function getEvent(run: GwsRunner, eventId: string) {
  return runJson<Record<string, unknown>>(run, [
    "calendar", "events", "get",
    "--params", JSON.stringify({ calendarId: "primary", eventId }),
  ]);
}

/** Your reply to each event, keyed by its id. An event Calendar will not return is left out. */
export async function fetchInviteStates(run: GwsRunner, eventIds: readonly string[]): Promise<Map<string, InviteState>> {
  const states = new Map<string, InviteState>();
  await Promise.all(
    eventIds.map(async (eventId) => {
      try {
        states.set(eventId, inviteState(await getEvent(run, eventId)));
      } catch {}
    }),
  );
  return states;
}

/** Reply to an invitation as you, the way the Yes, No, and Maybe links in its email do. */
export async function reply(run: GwsRunner, eventId: string, response: Reply): Promise<InviteState> {
  const event = await getEvent(run, eventId);
  const attendees = attendeesWithReply(event, response);
  if (attendees === null) throw new Error("You are not a guest of this event, so there is nothing to reply to.");
  const updated = await runJson<Record<string, unknown>>(run, [
    "calendar", "events", "patch",
    "--params", JSON.stringify({ calendarId: "primary", eventId }),
    "--json", JSON.stringify({ attendees }),
  ]);
  return inviteState(updated);
}
