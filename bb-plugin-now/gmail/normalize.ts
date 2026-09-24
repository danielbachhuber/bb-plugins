// Turn Gmail thread payloads into Now items. No I/O here.
import type { Item } from "../now/types.js";

export const SOURCE_ID = "gmail";

export type Raw = Record<string, unknown>;

export function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Gmail's snippets arrive HTML-escaped (`&#39;`, `&amp;`). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** `"Octocat" <octocat@example.com>` reads as `Octocat`; a bare address stays as it is. */
export function senderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match === null) return from.trim();
  return match[1]!.trim() || match[2]!.trim();
}

export function header(message: Raw, name: string): string | null {
  const payload = message.payload;
  if (!isRecord(payload) || !Array.isArray(payload.headers)) return null;
  for (const entry of payload.headers) {
    if (isRecord(entry) && typeof entry.name === "string" && entry.name.toLowerCase() === name.toLowerCase()) {
      return typeof entry.value === "string" ? entry.value : null;
    }
  }
  return null;
}

/** Whether any of a thread's messages is still unread in Gmail. */
export function hasUnread(messages: readonly Raw[]): boolean {
  return messages.some((message) => Array.isArray(message.labelIds) && message.labelIds.includes("UNREAD"));
}

/**
 * The thread in Gmail's web app. `authuser` picks the right account when
 * several are signed in, which `/u/0/` alone would not.
 */
export function threadUrl(threadId: string, account: string | null): string {
  const query = account === null ? "" : `?authuser=${encodeURIComponent(account)}`;
  return `https://mail.google.com/mail/${query}#all/${encodeURIComponent(threadId)}`;
}

/**
 * One thread from `threads get` in metadata format, or null when it has no
 * messages to show. The subject comes from the first message; the sender,
 * snippet, and time come from the latest, which is the one waiting on you.
 */
export function normalizeThread(raw: unknown, account: string | null): Item | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !Array.isArray(raw.messages)) return null;
  const messages = raw.messages.filter(isRecord);
  const first = messages[0];
  const latest = messages[messages.length - 1];
  if (first === undefined || latest === undefined) return null;

  const internalDate = Number(latest.internalDate);
  const from = header(latest, "From");

  return {
    id: `${SOURCE_ID}:${raw.id}`,
    source: SOURCE_ID,
    title: header(first, "Subject")?.trim() || "(no subject)",
    description: typeof latest.snippet === "string" ? decodeEntities(latest.snippet).trim() : "",
    priority: null,
    due: null,
    deadline: null,
    activityAt: Number.isFinite(internalDate) && internalDate > 0 ? new Date(internalDate).toISOString() : null,
    context: from === null ? null : senderName(from),
    tags: [],
    url: threadUrl(raw.id, account),
    gmail: { threadIds: [raw.id], unread: hasUnread(messages) },
    github: null,
  };
}
