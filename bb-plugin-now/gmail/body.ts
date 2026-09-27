// Read a whole email out of a `threads get` payload in full format. No I/O here.
import type { EmailThread } from "../now/contract.js";
import { decodeEntities, header, isRecord, senderName, threadUrl, type Raw } from "./normalize.js";

/** Gmail sends each part's bytes as base64url, in the charset the part names. */
function decodePart(part: Raw): string | null {
  const body = part.body;
  if (!isRecord(body) || typeof body.data !== "string") return null;
  const bytes = Buffer.from(body.data, "base64url");
  const charset = /charset="?([^";\s]+)"?/i.exec(header({ payload: part }, "Content-Type") ?? "")?.[1] ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/**
 * The first HTML and the first plain text part of a message, walking into
 * nested multiparts and passing over attachments, which carry a file name.
 */
export function messageBody(payload: unknown): { html: string | null; text: string | null } {
  const found: { html: string | null; text: string | null } = { html: null, text: null };
  const visit = (part: unknown) => {
    if (!isRecord(part)) return;
    if (typeof part.filename === "string" && part.filename !== "") return;
    const type = typeof part.mimeType === "string" ? part.mimeType.toLowerCase() : "";
    if (type === "text/html" && found.html === null) found.html = decodePart(part);
    else if (type === "text/plain" && found.text === null) found.text = decodePart(part);
    if (Array.isArray(part.parts)) part.parts.forEach(visit);
  };
  visit(payload);
  return found;
}

function addressOf(from: string): string | null {
  const match = /<([^>]+)>/.exec(from);
  if (match !== null) return match[1]!.trim();
  return from.includes("@") ? from.trim() : null;
}

/**
 * The thread as the Email tab shows it: the first message's subject, and
 * every message in order with its sender, time, and body. A message from
 * `account` is from "Me", as Gmail labels it.
 */
export function emailThread(raw: unknown, account: string | null): EmailThread | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !Array.isArray(raw.messages)) return null;
  const messages = raw.messages.filter(isRecord);
  const first = messages[0];
  if (first === undefined) return null;

  return {
    threadId: raw.id,
    subject: header(first, "Subject")?.trim() || "(no subject)",
    url: threadUrl(raw.id, account),
    messages: messages.map((message, index) => {
      const from = header(message, "From") ?? "";
      const address = addressOf(from);
      const mine = account !== null && address?.toLowerCase() === account.toLowerCase();
      const internalDate = Number(message.internalDate);
      return {
        id: typeof message.id === "string" ? message.id : String(index),
        from: mine ? "Me" : senderName(from) || "(unknown sender)",
        address,
        date: Number.isFinite(internalDate) && internalDate > 0 ? new Date(internalDate).toISOString() : null,
        snippet: typeof message.snippet === "string" ? decodeEntities(message.snippet).trim() : "",
        ...messageBody(message.payload),
      };
    }),
  };
}
