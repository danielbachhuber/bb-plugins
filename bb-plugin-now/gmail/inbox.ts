// An inbox's threads as rows: GitHub notifications gathered into one row per
// pull request or issue, every other thread a row of its own. No I/O here.
import {
  classifyEvent,
  commentText,
  githubUrl,
  parseRef,
  parseTitle,
  refKey,
  summarize,
  type GitHubEvent,
  type GitHubRef,
} from "../github/notifications.js";
import { stateFromHeader, type GitHubState } from "../github/state.js";
import type { Item } from "../now/types.js";
import { decodeEntities, header, isRecord, normalizeThread, SOURCE_ID, unreadOf, type Raw } from "./normalize.js";

/** The headers `threads get` is asked for, which everything here reads. */
export const METADATA_HEADERS = [
  "From",
  "Subject",
  "Message-ID",
  "In-Reply-To",
  "X-GitHub-Sender",
  "X-GitHub-Reason",
  "X-GitHub-PullRequestStatus",
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

function time(message: Raw): number {
  const value = Number(message.internalDate);
  return Number.isFinite(value) ? value : 0;
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

  // The newest message that says something in words.
  let comment: { author: string | null; text: string } | null = null;
  for (let index = messages.length - 1; index >= 0 && comment === null; index--) {
    const text = commentText(snippets[index]!);
    if (text !== "") comment = { author: header(messages[index]!, "X-GitHub-Sender"), text };
  }
  const requests = events.filter((event) => event.type === "review_requested");
  const reviewRequested =
    requests.length === 0 ? null : requests.some((event) => event.requestedOf === "you") ? "you" : "others";
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
      closedAs: known?.closedAs ?? null,
      reason: latest === undefined ? null : header(latest, "X-GitHub-Reason"),
      reviewRequested,
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
  const rows: Array<Item | { group: string }> = [];

  for (const thread of threads) {
    if (!isRecord(thread) || typeof thread.id !== "string") continue;
    const ref = githubRefOf(thread);
    if (ref === null) {
      const item = normalizeThread(thread, account);
      if (item !== null) rows.push(item);
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
    if (!("group" in row)) return row;
    const group = groups.get(row.group)!;
    return githubItem(group.ref, group.threads, states.get(row.group) ?? null);
  });
}
