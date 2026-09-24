// Google Docs, Slides, and Sheets comment notifications, read from their HTML
// body. No I/O here.
//
// Every one comes from `comments-noreply@docs.google.com` and has the same
// layout: a headline ("Octocat mentioned you in a comment in the following
// document"), a link to the document, then each discussion as the passage it
// is anchored to (`document-content-snippet`, absent for a comment on the
// whole document) followed by its posts (`non-tombstone-post`) and a
// `posts-section-end`. Each post has the author in an `<h3>` and, when it is
// new since the last email, an `<h4>New</h4>` badge.

import { decodeEntities } from "../gmail/normalize.js";

export type DocsApp = "docs" | "slides" | "sheets";

export interface DocsPost {
  author: string;
  text: string;
  /** New since the previous email about this document. */
  isNew: boolean;
}

export interface DocsDiscussion {
  /** The passage of the document the comment is on, or null when it has none. */
  anchor: string | null;
  posts: DocsPost[];
  /** Opens the document at this discussion. Null when the email has no link for it. */
  url: string | null;
}

export interface DocsEmail {
  /** "Octocat mentioned you in a comment", "Hubber added a comment", "New activity". */
  headline: string;
  mentioned: boolean;
  app: DocsApp;
  documentId: string;
  title: string;
  url: string;
  discussions: DocsDiscussion[];
}

export const DOCS_SENDER = "comments-noreply@docs.google.com";

const DOCUMENT_LINK =
  /<a [^>]*href="(https:\/\/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([A-Za-z0-9_-]+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/;

const APPS: Record<string, DocsApp> = { document: "docs", presentation: "slides", spreadsheets: "sheets" };

export const APP_NAMES: Record<DocsApp, string> = { docs: "Google Docs", slides: "Google Slides", sheets: "Google Sheets" };

/**
 * Markup to plain text: tags dropped (a block's edge becomes a space, an inline
 * tag nothing, so "@<a>octocat</a>" stays "@octocat"), entities decoded, and
 * whitespace collapsed. A tag cut off at the end, where a chunk was split
 * from the next, goes too.
 */
export function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<[^>]*$/, "")
      .replace(/<\/?(br|div|p|td|tr|table|li|h[1-6])\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "Octocat (octocat@example.com) mentioned you in a comment in the following
 * document" reads as "Octocat mentioned you in a comment".
 */
export function shortHeadline(headline: string): string {
  return headline
    .replace(/\s*\([^()\s]+@[^()\s]+\)/, "")
    .replace(/\s+(in|to|on) the following (document|presentation|spreadsheet|file)s?\s*$/i, "")
    .trim();
}

function parsePost(chunk: string): DocsPost | null {
  const author = chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/);
  if (author === null) return null;
  const isNew = /<h4[^>]*>\s*New\s*<\/h4>/i.test(chunk);
  // Everything after the author's name, less the "• 10:25 AM, Sep 24 (PDT)" stamp and the badge.
  const after = chunk.slice(author.index! + author[0].length).split(/class="posts-section-end"/)[0]!;
  const text = textOf(after.replace(/<h4[^>]*>[\s\S]*?<\/h4>/gi, ""))
    .replace(/^•\s*[^•]*?\([A-Z]{2,5}\)\s*/, "")
    .trim();
  return { author: textOf(author[1]!), text, isNew };
}

const DISCUSSION_LINK = /href="(https:\/\/docs\.google\.com\/[^"]*[?&]disco=[^"]*)"/;

/**
 * One discussion: what came before its `posts-section-end`, and after it the
 * links (Reply, Open) that belong to it. A comment on the whole document has
 * no passage, so the snippet is optional.
 */
function parseDiscussion(before: string, after: string): DocsDiscussion {
  const [lead, ...posts] = before.split(/class="non-tombstone-post"/);
  const snippet = lead?.split(/class="document-content-snippet"/)[1];
  const anchor = snippet?.match(/class="notranslate"[^>]*>([\s\S]*?)<\/span>/);
  const link = after.split(/class="non-tombstone-post"|class="document-content-snippet"/)[0]!.match(DISCUSSION_LINK);
  return {
    anchor: anchor ? textOf(anchor[1]!) || null : null,
    posts: posts.map(parsePost).filter((post): post is DocsPost => post !== null),
    url: link ? decodeEntities(link[1]!) : null,
  };
}

/** One notification's HTML body, or null when it is not laid out as one. */
export function parseDocsEmail(html: string): DocsEmail | null {
  const link = html.match(DOCUMENT_LINK);
  const heading = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/);
  if (link === null || heading === null) return null;

  const headline = textOf(heading[1]!);
  const sections = html.split(/class="posts-section-end"/);
  const discussions = sections
    .slice(0, -1)
    .map((before, index) => parseDiscussion(before, sections[index + 1]!))
    .filter((discussion) => discussion.posts.length > 0);
  return {
    headline: shortHeadline(headline),
    mentioned: /\bmentioned you\b|\bassigned (you|to you)\b/i.test(headline),
    app: APPS[link[2]!]!,
    documentId: link[3]!,
    title: textOf(link[4]!),
    url: decodeEntities(link[1]!),
    discussions,
  };
}

/** The new posts across a set of emails, oldest email first, without repeats. */
export function newPosts(emails: readonly DocsEmail[]): DocsPost[] {
  const seen = new Set<string>();
  const posts: DocsPost[] = [];
  for (const email of emails) {
    for (const discussion of email.discussions) {
      for (const post of discussion.posts) {
        const key = `${post.author}\n${post.text}`;
        if (!post.isNew || seen.has(key)) continue;
        seen.add(key);
        posts.push(post);
      }
    }
  }
  return posts;
}

/** Posts that record an action rather than words, and how a row says them. */
const ACTIONS: Record<string, string> = {
  "marked as resolved": "resolved the comment",
  "reopened": "reopened the comment",
  "accepted suggestion": "accepted a suggestion",
  "rejected suggestion": "rejected a suggestion",
};

/** What a row quotes for a post: its words, or the action it records. */
export function postLine(post: DocsPost): string {
  return ACTIONS[post.text.toLowerCase()] ?? post.text;
}

function people(names: readonly string[]): string {
  const unique = [...new Set(names)];
  if (unique.length <= 3) return unique.join(", ");
  return `${unique.slice(0, 3).join(", ")} and ${unique.length - 3} more`;
}

/**
 * "Octocat mentioned you in a comment · 2 new comments from Octocat, Hubber ·
 * 1 resolved": the latest email's headline, then what is new.
 */
export function summarizeDocs(latest: DocsEmail, posts: readonly DocsPost[]): string {
  const parts = [latest.headline];
  const comments = posts.filter((post) => post.text !== "" && ACTIONS[post.text.toLowerCase()] === undefined);
  const resolved = posts.filter((post) => /^marked as resolved$/i.test(post.text)).length;
  if (comments.length > 0) {
    const count = comments.length === 1 ? "1 new comment" : `${comments.length} new comments`;
    parts.push(`${count} from ${people(comments.map((post) => post.author))}`);
  }
  if (resolved > 0) parts.push(`${resolved} resolved`);
  return parts.join(" · ");
}
