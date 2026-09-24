// GitHub's notification emails, read from their headers and snippets. No I/O.
//
// Every notification names its pull request or issue in `In-Reply-To` (or, on
// the first message of a thread, `Message-ID`) as
// `<owner/repo/pull/123@github.com>`, and the person who acted in
// `X-GitHub-Sender`. What they did is the opening of the snippet, which GitHub
// writes in a handful of fixed phrasings.

export type GitHubKind = "pull" | "issue";

/** Which pull request or issue a notification is about. */
export interface GitHubRef {
  repo: string;
  number: number;
  kind: GitHubKind;
}

export type GitHubEventType =
  | "comment"
  | "approved"
  | "changes_requested"
  | "review_requested"
  | "merged"
  | "closed"
  | "reopened"
  | "pushed"
  | "other";

export interface GitHubEvent {
  type: GitHubEventType;
  /** The login of whoever acted, or null when the email does not say. */
  actor: string | null;
  /**
   * For a review request, whose review was asked for: `you`, or the login or
   * `org/team` GitHub names. A team you are in notifies you with the same
   * reason as a request of you, so only the wording tells them apart.
   */
  requestedOf?: string;
}

const REF = /^<([^/<>\s]+\/[^/<>\s]+)\/(pull|issues)\/(\d+)[/@]/;

/** `<acme/widgets/pull/128@github.com>` and its per-comment variants. */
export function parseRef(header: string | null): GitHubRef | null {
  const match = header?.trim().match(REF);
  if (!match) return null;
  return { repo: match[1]!, number: Number(match[3]), kind: match[2] === "pull" ? "pull" : "issue" };
}

/** `Re: [acme/widgets] Promote widgets into core (PR #128)` reads as `Promote widgets into core`. */
export function parseTitle(subject: string): string {
  return subject
    .replace(/^\s*((re|fwd?):\s*)+/i, "")
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s*\((PR|Issue|Discussion) #\d+\)\s*$/i, "")
    .trim();
}

/**
 * What one notification says happened. The phrasings are GitHub's own; an
 * opening this does not know is `other`, which the summary leaves out rather
 * than guessing at.
 */
export function classifyEvent(snippet: string, sender: string | null): GitHubEvent {
  const text = snippet.trim();
  const actor = sender?.trim() || null;

  if (/^Merged #\d+ into /i.test(text)) return { type: "merged", actor };
  if (/\bapproved this pull request\b/i.test(text)) return { type: "approved", actor };
  if (/\brequested changes on this pull request\b/i.test(text)) return { type: "changes_requested", actor };
  if (/\brequested your review\b/i.test(text)) return { type: "review_requested", actor, requestedOf: "you" };
  const requested = text.match(/\brequested review from @?([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)/i);
  if (requested) return { type: "review_requested", actor, requestedOf: requested[1]! };
  if (/^Closed #\d+/i.test(text) || /\bclosed this (pull request|issue)\b/i.test(text)) return { type: "closed", actor };
  if (/^Reopened #\d+/i.test(text) || /\breopened this\b/i.test(text)) return { type: "reopened", actor };
  if (/\bpushed \d+ commits?\b/i.test(text)) return { type: "pushed", actor };
  if (/\bleft a comment\b|\bcommented on this\b|\bcommented on\b/i.test(text)) return { type: "comment", actor };
  return { type: "other", actor };
}

function people(actors: readonly (string | null)[]): string {
  const unique = [...new Set(actors.filter((actor): actor is string => actor !== null))];
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} and ${unique.length - 3} more`;
}

/**
 * "3 comments from octocat, hubber · approved by hubber · merged", oldest
 * first within each kind. Pushes and unknown events are left out: they are
 * noise next to what someone said or decided.
 */
export function summarize(events: readonly GitHubEvent[]): string {
  const parts: string[] = [];
  const of = (type: GitHubEventType) => events.filter((event) => event.type === type);

  const comments = of("comment");
  if (comments.length > 0) {
    const who = people(comments.map((event) => event.actor));
    const count = comments.length === 1 ? "1 comment" : `${comments.length} comments`;
    parts.push(who === "" ? count : `${count} from ${who}`);
  }
  // A request of you reads as it always has; one of a team or someone else says whose.
  const requests = of("review_requested");
  const ofYou = requests.filter((event) => event.requestedOf === undefined || event.requestedOf === "you");
  if (ofYou.length > 0) {
    const who = people(ofYou.map((event) => event.actor));
    parts.push(who === "" ? "review requested" : `review requested by ${who}`);
  }
  const ofOthers = new Map<string, (string | null)[]>();
  for (const event of requests) {
    if (event.requestedOf === undefined || event.requestedOf === "you") continue;
    ofOthers.set(event.requestedOf, [...(ofOthers.get(event.requestedOf) ?? []), event.actor]);
  }
  for (const [of, actors] of ofOthers) {
    const who = people(actors);
    parts.push(who === "" ? `review requested of ${of}` : `review requested of ${of} by ${who}`);
  }
  for (const [type, label] of [
    ["changes_requested", "changes requested by"],
    ["approved", "approved by"],
  ] as const) {
    const matching = of(type);
    if (matching.length === 0) continue;
    const who = people(matching.map((event) => event.actor));
    parts.push(who === "" ? label.replace(/ by$/, "") : `${label} ${who}`);
  }
  if (of("merged").length > 0) parts.push("merged");
  else if (of("closed").length > 0 && of("reopened").length === 0) parts.push("closed");

  return parts.join(" · ");
}

/**
 * What someone wrote, out of a notification's snippet: GitHub's own opening
 * ("octocat left a comment (acme/widgets#128)") and footer ("— Reply to this
 * email directly, view it on GitHub…") come off, leaving the words. Empty when
 * nothing was written, as for "Merged #128 into main." or a bare approval.
 */
export function commentText(snippet: string): string {
  let text = snippet.trim();
  // The snippet can end partway through the footer, so its first words are enough.
  text = text.replace(/\s*—\s*Reply( to this email)?\b[\s\S]*$/i, "");
  text = text.replace(/^@?[A-Za-z0-9-]+(\[bot\])? left a comment \([^)]*\)\s*/i, "");
  text = text.replace(
    /^@?[A-Za-z0-9-]+(\[bot\])? (commented on|approved|requested changes on) this pull request\.?\s*/i,
    "",
  );
  // A review comment on a line carries the file and its diff hunk, which read
  // as noise in a quote: keep what came before them, if anything did.
  text = text.replace(/(^|\s)In [^\s:]+:\s*>[\s\S]*$/, "");
  if (/^(Merged|Closed|Reopened) #\d+/i.test(text)) return "";
  return text.trim();
}

/** The pull request or issue page on GitHub. */
export function githubUrl(ref: GitHubRef): string {
  return `https://github.com/${ref.repo}/${ref.kind === "pull" ? "pull" : "issues"}/${ref.number}`;
}

export function refKey(ref: GitHubRef): string {
  return `${ref.repo}#${ref.number}`;
}
