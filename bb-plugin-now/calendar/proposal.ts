// A guest's proposal of a new time for one of your events: the time it names,
// read from the email's invite.ics, and how it reads on the row. No I/O here;
// api.ts asks Calendar and moves the event.
//
// Calendar sends the proposal to the organizer with
// `X-Google-Calendar-Notification: rsvpProposeNewTime` among its kinds, and an
// invite.ics whose METHOD is COUNTER and whose DTSTART and DTEND are the time
// proposed.

/**
 * A time on an event, as Calendar holds it: `YYYY-MM-DD` for an all-day
 * event, or an ISO 8601 date-time.
 */
export type EventTime = string;

export interface ProposedTime {
  start: EventTime;
  end: EventTime;
}

/** An iCalendar file's lines, with the folded ones joined back together. */
function unfold(ics: string): string[] {
  return ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
}

/** Milliseconds `zone` is ahead of UTC at `utc`. */
function zoneOffset(utc: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utc));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utc;
}

/** One DTSTART or DTEND line's value as an EventTime, or null when it cannot be read. */
function eventTime(params: string, value: string): EventTime | null {
  const date = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (date !== null) return `${date[1]}-${date[2]}-${date[3]}`;
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number) as number[];
  const wall = Date.UTC(year!, month! - 1, day!, hour!, minute!, second!);
  if (match[7] === "Z") return new Date(wall).toISOString();
  const zone = params.match(/;TZID=([^;:]+)/)?.[1];
  if (zone === undefined) return null;
  try {
    // The wall time in that zone, then corrected once in case the guess crossed a DST change.
    const guess = wall - zoneOffset(wall, zone);
    return new Date(wall - zoneOffset(guess, zone)).toISOString();
  } catch {
    return null;
  }
}

/** The time a COUNTER invite.ics proposes, or null when it is not one or names no time. */
export function proposedTime(ics: string): ProposedTime | null {
  const lines = unfold(ics);
  if (!lines.some((line) => /^METHOD:COUNTER$/i.test(line.trim()))) return null;
  let start: EventTime | null = null;
  let end: EventTime | null = null;
  let inEvent = false;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") inEvent = true;
    else if (line === "END:VEVENT") break;
    else if (inEvent) {
      const match = line.match(/^(DTSTART|DTEND)((?:;[^:]*)?):(.*)$/);
      if (match === null) continue;
      const time = eventTime(match[2]!, match[3]!.trim());
      if (match[1] === "DTSTART") start = time;
      else end = time;
    }
  }
  return start === null || end === null ? null : { start, end };
}

function sameTime(a: EventTime, b: EventTime): boolean {
  if (a.length === 10 || b.length === 10) return a === b;
  return Date.parse(a) === Date.parse(b);
}

/** Whether the event is already at the proposed time. */
export function isAtProposedTime(proposal: ProposedTime, current: ProposedTime | null): boolean {
  return current !== null && sameTime(proposal.start, current.start) && sameTime(proposal.end, current.end);
}

/** A Calendar event's `start` or `end` as an EventTime. */
export function fromEventField(field: unknown): EventTime | null {
  if (typeof field !== "object" || field === null) return null;
  const { dateTime, date } = field as { dateTime?: unknown; date?: unknown };
  if (typeof dateTime === "string") return dateTime;
  return typeof date === "string" ? date : null;
}

/**
 * The `start` or `end` to patch an event with, keeping the time zone the
 * event is shown in. An all-day time clears the date-time, and the other way
 * round, since Calendar rejects an event holding both.
 */
export function toEventField(time: EventTime, current: unknown): Record<string, unknown> {
  const zone = typeof current === "object" && current !== null ? (current as { timeZone?: unknown }).timeZone : undefined;
  if (time.length === 10) return { date: time, dateTime: null };
  return typeof zone === "string" ? { dateTime: time, timeZone: zone, date: null } : { dateTime: time, date: null };
}

function localDate(time: EventTime): Date {
  if (time.length === 10) {
    const [year, month, day] = time.split("-").map(Number) as [number, number, number];
    return new Date(year, month - 1, day);
  }
  return new Date(time);
}

function dayText(date: Date, now: Date): string {
  const text = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
  return date.getFullYear() === now.getFullYear() ? text : `${text}, ${date.getFullYear()}`;
}

function clockText(date: Date): string {
  const hours = date.getHours() % 12 || 12;
  const suffix = date.getHours() < 12 ? "am" : "pm";
  return date.getMinutes() === 0 ? `${hours}${suffix}` : `${hours}:${String(date.getMinutes()).padStart(2, "0")}${suffix}`;
}

/**
 * A span of time the way Calendar's emails write one, in the viewer's time
 * zone: "Mon Sep 28, 3pm – 3:30pm", or "Mon Sep 28" for an all-day event. With
 * `sameDayAs`, a span on that one's day leaves its day out: "2pm – 2:30pm".
 */
export function spanText(span: ProposedTime, now: Date, sameDayAs?: ProposedTime): string {
  const start = localDate(span.start);
  if (span.start.length === 10) return dayText(start, now);
  const end = localDate(span.end);
  const clock = `${clockText(start)} – ${clockText(end)}`;
  const reference = sameDayAs === undefined ? null : localDate(sameDayAs.start);
  if (reference !== null && reference.toDateString() === start.toDateString()) return clock;
  return `${dayText(start, now)}, ${clock}`;
}
