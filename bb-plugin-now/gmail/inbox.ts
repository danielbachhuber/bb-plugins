// An inbox's threads as rows: GitHub notifications gathered into one row per
// pull request or issue, every other thread a row of its own. No I/O here.
import {
  classifyEvent,
  commentText,
  eventLine,
  snippetComplete,
  githubUrl,
  parseRef,
  parseTitle,
  refKey,
  summarize,
  type GitHubEvent,
  type GitHubRef,
} from "../github/notifications.js";
import { stateFromHeader, type GitHubState } from "../github/state.js";
import { CALENDAR_HEADER, eventIdFromBody, notificationKind } from "../calendar/invite.js";
import { proposedTime } from "../calendar/proposal.js";
import { APP_NAMES, DOCS_SENDER, documentUrl, newPosts, parseDocsEmail, postLine, summarizeDocs, type DocsEmail } from "../gdocs/notifications.js";
import type { GitHubQuote, Item } from "../now/types.js";
import { decodeEntities, header, isRecord, normalizeThread, SOURCE_ID, unreadOf, type Raw } from "./normalize.js";

/** The headers `threads get` is asked for, which everything here reads. */
export const METADATA_HEADERS = [
  "From",
  "To",
  "Subject",
  "Message-ID",
  "In-Reply-To",
  "X-GitHub-Sender",
  "X-GitHub-Reason",
  "X-GitHub-PullRequestStatus",
  CALENDAR_HEADER,
];

function messagesOf(thread: unknown): Raw[] {
  return isRecord(thread) && Array.isArray(thread.messages) ? thread.messages.filter(isRecord) : [];
}

/**
 * The pull request or issue a thread of GitHub notifications is about, or
 * null for any other thread. `X-GitHub-Reason` is only on GitHub's own mail,
 * so a person's email that quotes a GitHub link is not mistaken for one.
 */
export function githubRefOf(thread: unknown): GitHubRef | null {
  for (const message of messagesOf(thread)) {
    if (header(message, "X-GitHub-Reason") === null) continue;
    const ref = parseRef(header(message, "In-Reply-To")) ?? parseRef(header(message, "Message-ID"));
    if (ref !== null) return ref;
  }
  return null;
}

/** Whether a thread holds Google's comment notifications, whose bodies are worth fetching. */
export function isDocsThread(thread: unknown): boolean {
  return messagesOf(thread).some((message) => header(message, "From")?.toLowerCase().includes(DOCS_SENDER) === true);
}

/** The latest calendar notification in a thread that asks something of you, with what it is. */
function calendarNotification(thread: unknown): { message: Raw; kind: "invitation" | "cancelled" | "proposal" } | null {
  const messages = messagesOf(thread);
  for (let index = messages.length - 1; index >= 0; index--) {
    const kind = notificationKind(header(messages[index]!, CALENDAR_HEADER));
    if (kind !== null) return { message: messages[index]!, kind };
  }
  return null;
}

/** Whether a thread's body is worth fetching: Google's comment emails, and calendar invitations and proposals. */
export function needsBody(thread: unknown): boolean {
  return isDocsThread(thread) || calendarNotification(thread) !== null;
}

/** The event an invitation thread is about, read from its body when it was fetched in full. */
function inviteOf(thread: unknown): Item["invite"] {
  const found = calendarNotification(thread);
  if (found === null || found.kind === "proposal") return null;
  const body = htmlBody(found.message);
  return {
    eventId: body === null ? null : eventIdFromBody(body),
    response: null,
    cancelled: found.kind === "cancelled",
  };
}

/** The time a proposal thread proposes, read from its invite.ics once that has been fetched. */
function proposalOf(thread: unknown): Item["proposal"] {
  const found = calendarNotification(thread);
  if (found === null || found.kind !== "proposal") return null;
  const ics = calendarPart(found.message);
  const data = isRecord(ics?.body) && typeof ics.body.data === "string" ? ics.body.data : null;
  const proposed = data === null ? null : proposedTime(Buffer.from(data, "base64url").toString("utf8"));
  if (proposed === null) return null;
  const body = htmlBody(found.message);
  return { eventId: body === null ? null : eventIdFromBody(body), proposed, current: null, cancelled: false };
}

/**
 * The invite.ics of a proposal thread's latest proposal, when Gmail left it
 * as an attachment to fetch rather than including it, which it does for any
 * part with a file name.
 */
export function proposalAttachment(thread: unknown): { messageId: string; part: Raw; attachmentId: string } | null {
  const found = calendarNotification(thread);
  if (found === null || found.kind !== "proposal" || typeof found.message.id !== "string") return null;
  const part = calendarPart(found.message);
  const body = part?.body;
  if (part === null || !isRecord(body) || typeof body.data === "string" || typeof body.attachmentId !== "string") return null;
  return { messageId: found.message.id, part, attachmentId: body.attachmentId };
}

/** A message's first part that passes `test`, when the thread was fetched in full. */
function partOf(message: Raw, test: (part: Raw) => boolean): Raw | null {
  let found: Raw | null = null;
  const walk = (part: unknown) => {
    if (found !== null || !isRecord(part)) return;
    if (test(part)) {
      found = part;
      return;
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(message.payload);
  return found;
}

function calendarPart(message: Raw): Raw | null {
  return partOf(message, (part) => part.mimeType === "text/calendar");
}

/** A message's HTML body, when the thread was fetched in full. */
function htmlBody(message: Raw): string | null {
  const part = partOf(message, (each) => each.mimeType === "text/html" && isRecord(each.body) && typeof each.body.data === "string");
  return part === null ? null : Buffer.from((part.body as { data: string }).data, "base64url").toString("utf8");
}

/** The comment notifications in a thread, oldest first, each with its message. */
function docsEmailsOf(thread: unknown): Array<{ message: Raw; email: DocsEmail }> {
  const emails: Array<{ message: Raw; email: DocsEmail }> = [];
  for (const message of messagesOf(thread)) {
    if (header(message, "From")?.toLowerCase().includes(DOCS_SENDER) !== true) continue;
    const html = htmlBody(message);
    const email = html === null ? null : parseDocsEmail(html);
    if (email !== null) emails.push({ message, email });
  }
  return emails;
}

function isUnreadMessage(message: Raw): boolean {
  return Array.isArray(message.labelIds) && message.labelIds.includes("UNREAD");
}

/** Every thread about one document, as its one row. */
function docsItem(threads: readonly Raw[]): Item {
  const found = threads.flatMap(docsEmailsOf).sort((a, b) => time(a.message) - time(b.message));
  const latest = found[found.length - 1]!;
  const unread = found.filter(({ message }) => isUnreadMessage(message));
  // What is new in the unread emails, or in the latest one once they are all read.
  const posts = newPosts((unread.length > 0 ? unread : [latest]).map(({ email }) => email));
  const discussion = [...latest.email.discussions].reverse().find((each) => each.posts.some((post) => post.isNew));
  const latestTime = time(latest.message);
  const messages = threads.flatMap(messagesOf);

  return {
    id: `gdocs:${latest.email.documentId}`,
    source: SOURCE_ID,
    title: latest.email.title,
    description: summarizeDocs(latest.email, posts),
    priority: null,
    due: null,
    deadline: null,
    activityAt: latestTime > 0 ? new Date(latestTime).toISOString() : null,
    context: APP_NAMES[latest.email.app],
    tags: [],
    url: discussion?.url ?? latest.email.url,
    gmail: { threadIds: threads.map((thread) => thread.id as string), ...unreadOf(messages) },
    github: null,
    doc: {
      app: latest.email.app,
      documentId: latest.email.documentId,
      url: documentUrl(latest.email.app, latest.email.documentId),
      mentioned: found.some(({ email }) => email.mentioned),
      quotes: posts.map((post) => ({ author: post.author, text: postLine(post), url: post.url })),
    },
  };
}

function time(message: Raw): number {
  const value = Number(message.internalDate);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Whose review the requests asked for. On an open pull request GitHub says:
 * a request still waiting on you, directly or through a team you are on, or
 * a review you gave, makes it yours, since a team's request you answered was
 * yours too; anything else is others'. Otherwise the emails say: a team's
 * request is yours to pick up while GitHub still lists the team as pending,
 * and others' once it does not. Without any answer from GitHub, a team's
 * request stays yours, since suggesting Archive on a review you owe is the
 * worse mistake.
 */
function whoseReview(requests: readonly GitHubEvent[], state: GitHubState | null): "you" | "team" | "others" | null {
  if (requests.length === 0) return null;
  if (state?.myReview !== undefined) {
    if (state.requestedVia != null) return state.requestedVia;
    return state.myReview === null ? "others" : "you";
  }
  const pending = state?.pendingReviewers;
  if (requests.some((event) => event.requestedOf === "you")) return "you";
  const teams = requests.flatMap((event) => (event.requestedOf?.includes("/") ? [event.requestedOf.toLowerCase()] : []));
  if (teams.length === 0) return "others";
  if (pending === undefined) return "team";
  const waiting = new Set(pending.map((name) => name.toLowerCase()));
  return teams.some((team) => waiting.has(team)) ? "team" : "others";
}

/** Every thread about one pull request or issue, as its one row. */
function githubItem(ref: GitHubRef, threads: readonly Raw[], state: GitHubState | null): Item {
  const messages = threads.flatMap(messagesOf).sort((a, b) => time(a) - time(b));
  const first = messages[0];
  const latest = messages[messages.length - 1];

  const snippets = messages.map((message) =>
    decodeEntities(typeof message.snippet === "string" ? message.snippet : ""),
  );
  const events: GitHubEvent[] = messages.map((message, index) =>
    classifyEvent(snippets[index]!, header(message, "X-GitHub-Sender")),
  );

  // A quote can be read in full later, from its message, when the snippet cut it short.
  const quote = (index: number, text: string): GitHubQuote => {
    const message = messages[index]!;
    const cut = commentText(snippets[index]!) !== "" && !snippetComplete(snippets[index]!);
    return {
      author: header(message, "X-GitHub-Sender"),
      text,
      ...(typeof message.id === "string" ? { messageId: message.id } : {}),
      ...(cut ? { cut } : {}),
    };
  };
  // The newest message that says something in words.
  let comment: GitHubQuote | null = null;
  for (let index = messages.length - 1; index >= 0 && comment === null; index--) {
    const text = commentText(snippets[index]!);
    if (text !== "") comment = quote(index, text);
  }
  // A line for each unread message, so a row with three new says what all three were.
  const unreadQuotes: GitHubQuote[] = [];
  messages.forEach((message, index) => {
    if (!(Array.isArray(message.labelIds) && message.labelIds.includes("UNREAD"))) return;
    const text = eventLine(events[index]!, snippets[index]!);
    if (text !== "") unreadQuotes.push(quote(index, text));
  });

  const requests = events.filter((event) => event.type === "review_requested");
  const reviewRequested = whoseReview(requests, state);
  const latestTime = latest === undefined ? 0 : time(latest);
  const known = state ?? stateFromHeader(latest === undefined ? null : header(latest, "X-GitHub-PullRequestStatus"));

  return {
    id: `github:${refKey(ref)}`,
    source: SOURCE_ID,
    title: (first === undefined ? null : parseTitle(header(first, "Subject") ?? "")) || `${refKey(ref)}`,
    description: summarize(events),
    priority: null,
    due: null,
    deadline: null,
    activityAt: latestTime > 0 ? new Date(latestTime).toISOString() : null,
    context: refKey(ref),
    tags: [],
    url: githubUrl(ref),
    gmail: { threadIds: threads.map((thread) => thread.id as string), ...unreadOf(messages) },
    github: {
      repo: ref.repo,
      number: ref.number,
      kind: ref.kind,
      state: known?.state ?? null,
      review: known?.review ?? null,
      ...(state?.checks === undefined ? {} : { checks: state.checks }),
      ...(state?.mergeMethods === undefined ? {} : { mergeMethods: state.mergeMethods }),
      ...(state?.myReview === undefined ? {} : { myReview: state.myReview }),
      ...(state?.reviewers === undefined ? {} : { reviewers: state.reviewers }),
      closedAs: known?.closedAs ?? null,
      reason: latest === undefined ? null : header(latest, "X-GitHub-Reason"),
      reviewRequested,
      unreadQuotes,
      comment,
    },
  };
}

/** The GitHub references in a set of threads, one per pull request or issue. */
export function githubRefs(threads: readonly unknown[]): GitHubRef[] {
  const refs = new Map<string, GitHubRef>();
  for (const thread of threads) {
    const ref = githubRefOf(thread);
    if (ref !== null) refs.set(refKey(ref), ref);
  }
  return [...refs.values()];
}

/**
 * The rows for a page of threads, in the order they arrived. `states` is what
 * gh said about each `repo#number`; a reference it has nothing for falls back
 * to the latest email's header.
 */
export function inboxItems(
  threads: readonly unknown[],
  account: string | null,
  states: ReadonlyMap<string, GitHubState> = new Map(),
): Item[] {
  const groups = new Map<string, { ref: GitHubRef; threads: Raw[] }>();
  const documents = new Map<string, Raw[]>();
  const rows: Array<Item | { group: string } | { document: string }> = [];

  for (const thread of threads) {
    if (!isRecord(thread) || typeof thread.id !== "string") continue;
    const documentId = docsEmailsOf(thread)[0]?.email.documentId;
    if (documentId !== undefined) {
      const group = documents.get(documentId);
      if (group === undefined) {
        documents.set(documentId, [thread]);
        rows.push({ document: documentId });
      } else {
        group.push(thread);
      }
      continue;
    }
    const ref = githubRefOf(thread);
    if (ref === null) {
      const item = normalizeThread(thread, account);
      if (item !== null) {
        const invite = inviteOf(thread);
        const proposal = invite === null ? proposalOf(thread) : null;
        rows.push(invite !== null ? { ...item, invite } : proposal !== null ? { ...item, proposal } : item);
      }
      continue;
    }
    const key = refKey(ref);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { ref, threads: [thread] });
      rows.push({ group: key });
    } else {
      group.threads.push(thread);
    }
  }

  return rows.map((row) => {
    if ("document" in row) return docsItem(documents.get(row.document)!);
    if (!("group" in row)) return row;
    const group = groups.get(row.group)!;
    return githubItem(group.ref, group.threads, states.get(row.group) ?? null);
  });
}
