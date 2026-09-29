// The only module that asks Google Calendar anything, through gws.
import { runJson, type GwsRunner } from "../gmail/gws.js";
import { attendeesWithReply, inviteState, type InviteState, type Reply } from "./invite.js";
import { toEventField, type ProposedTime } from "./proposal.js";

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

/**
 * Move an event you organize to the time a guest proposed, as accepting the
 * proposal in Calendar does, and email every guest the new time.
 */
export async function acceptProposal(run: GwsRunner, eventId: string, proposed: ProposedTime): Promise<InviteState> {
  const event = await getEvent(run, eventId);
  const updated = await runJson<Record<string, unknown>>(run, [
    "calendar", "events", "patch",
    "--params", JSON.stringify({ calendarId: "primary", eventId, sendUpdates: "all" }),
    "--json", JSON.stringify({ start: toEventField(proposed.start, event.start), end: toEventField(proposed.end, event.end) }),
  ]);
  return inviteState(updated);
}
