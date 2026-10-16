/**
 * The wins doc: a title, then one heading per month, newest first, such as
 * `September 2026`, each followed by a bulleted list of that month's wins.
 *
 * Pure, like `journal-insert.ts`: it reads the doc's text or its
 * `documents.get` shape and returns `batchUpdate` requests, so it can be
 * tested without Google. `server.ts` makes the calls.
 */
import { addDays, instantToDay, toDay } from "./dates.js";
import {
  batch,
  bulletRequests,
  headingRank,
  isHeading,
  paragraphs,
  type DocsDocument,
  type EntryLine,
  type Para,
  type Plan,
} from "./journal-insert.js";
import type { Day } from "./types.js";

/** A month as `YYYY-MM`. */
export type Month = string;

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** The calendar month before the one `today` is in. */
export function previousMonth(today: Date = new Date()): Month {
  return toMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}

function toMonth(date: Date): Month {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Reads `2026-09` or `September 2026`. Null for anything else. */
export function parseMonth(value: string): Month | null {
  const trimmed = value.trim();
  const numeric = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (numeric !== null) {
    const month = Number(numeric[2]);
    return month >= 1 && month <= 12 ? trimmed : null;
  }
  const named = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
  if (named === null) return null;
  const index = MONTHS.indexOf(named[1].toLowerCase());
  return index === -1 ? null : `${named[2]}-${String(index + 1).padStart(2, "0")}`;
}

/** `September 2026`, as the doc writes its headings. */
export function monthHeading(month: Month): string {
  const [year, number] = month.split("-").map(Number);
  const name = MONTHS[number - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

/**
 * The Mondays of the weeks that belong to the month: those whose Friday falls
 * in it, since the journal heads each week's entry with its Friday.
 */
export function weeksOf(month: Month): Day[] {
  const [year, number] = month.split("-").map(Number);
  const first = toDay(new Date(year, number - 1, 1));
  // The Monday on or before the 1st, then forward a week at a time.
  const dow = new Date(year, number - 1, 1).getDay();
  let monday = addDays(first, -((dow + 6) % 7));
  const mondays: Day[] = [];
  for (; ; monday = addDays(monday, 7)) {
    const friday = addDays(monday, 4);
    if (friday.slice(0, 7) > month) break;
    if (friday.slice(0, 7) === month) mondays.push(monday);
  }
  return mondays;
}

/** The first and last day of the month. */
export function monthRange(month: Month): { from: Day; to: Day } {
  const [year, number] = month.split("-").map(Number);
  return { from: toDay(new Date(year, number - 1, 1)), to: toDay(new Date(year, number, 0)) };
}

export interface MonthPrCounts {
  opened: number;
  merged: number;
  reviewed: number;
}

/** A reviewed pull request as the GraphQL search returns it. */
export interface ReviewedNode {
  number?: number;
  author?: { login?: string } | null;
  reviews?: { nodes: Array<{ submittedAt: string | null }> };
}

/**
 * Other people's pull requests with at least one review by `author`
 * submitted inside the month, by the local day it was submitted.
 */
export function countReviewed(nodes: ReviewedNode[], month: Month, author: string): number {
  const numbers = new Set<number>();
  for (const node of nodes) {
    if (node.number === undefined || node.author?.login === author) continue;
    const inMonth = (node.reviews?.nodes ?? []).some(
      (review) => review.submittedAt !== null && instantToDay(review.submittedAt).slice(0, 7) === month,
    );
    if (inMonth) numbers.add(node.number);
  }
  return numbers.size;
}

/** `Opened 12 pull requests, had 9 merged, and reviewed 30.` */
export function statsLine(counts: MonthPrCounts): string {
  const prs = counts.opened === 1 ? "pull request" : "pull requests";
  return `Opened ${counts.opened} ${prs}, had ${counts.merged} merged, and reviewed ${counts.reviewed}.`;
}

const HEADING_LINE = /^(#{1,6})\s+(.*?)\s*$/;

/**
 * The month's section of the doc as the Google Doc script prints it, with
 * markdown headings: everything under the month's heading up to the next
 * heading at its level or above. Null when the month has no heading. The
 * body drops bullets with no text, which the doc keeps as placeholders.
 */
export function monthSection(text: string, month: Month): { heading: string; body: string } | null {
  const lines = text.split(/\r?\n/);
  const wanted = monthHeading(month).toLowerCase();
  const start = lines.findIndex((line) => HEADING_LINE.exec(line)?.[2].toLowerCase() === wanted);
  if (start === -1) return null;
  const level = HEADING_LINE.exec(lines[start])![1].length;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const heading = HEADING_LINE.exec(line);
    if (heading !== null && heading[1].length <= level) break;
    if (/^\s*[-*]\s*$/.test(line)) continue;
    body.push(line);
  }
  return { heading: HEADING_LINE.exec(lines[start])![2], body: body.join("\n").trim() };
}

/** The month a heading names, such as `September 2026`, or null. */
function headingMonth(para: Para): Month | null {
  return isHeading(para) ? parseMonth(para.text) : null;
}

/**
 * The requests that put `lines` at the end of the month's wins, after its
 * last paragraph with text, so they land above any empty placeholder bullets
 * and below the italic line of counts.
 * When the month has no heading, the plan is to add one first, above the
 * newest earlier month and in its style; read the doc again and plan again.
 */
export function planWinsInsert(doc: DocsDocument, month: Month, lines: EntryLine[]): Plan {
  if (lines.length === 0) throw new Error("The wins have no bullets.");
  const paras = paragraphs(doc);
  const at = paras.findIndex((para) => headingMonth(para) === month);

  if (at === -1) {
    const below = paras.find((para) => {
      const found = headingMonth(para);
      return found !== null && found < month;
    });
    if (below === undefined) {
      throw new Error(`The doc has no month heading earlier than ${monthHeading(month)} to add one above.`);
    }
    const heading = monthHeading(month);
    return {
      kind: "create",
      heading,
      body: batch(doc, [
        { insertText: { location: { index: below.start }, text: `${heading}\n` } },
        {
          updateParagraphStyle: {
            range: { startIndex: below.start, endIndex: below.start + heading.length + 1 },
            paragraphStyle: { namedStyleType: below.style },
            fields: "namedStyleType",
          },
        },
      ]),
    };
  }

  const heading = paras[at];
  let anchor = at;
  for (let index = at + 1; index < paras.length; index++) {
    const para = paras[index];
    if (isHeading(para) && headingRank(para) <= headingRank(heading)) break;
    // A bullet with text, or the italic line under the heading. Empty
    // placeholder bullets stay below what is added.
    if (para.text.trim() !== "") anchor = index;
  }
  return {
    kind: "insert",
    heading: heading.text,
    headingId: heading.headingId,
    body: batch(doc, bulletRequests(paras[anchor].end - 1, lines)),
  };
}

/**
 * The requests that put `text` in italics on its own line directly under the
 * month's heading, replacing the italic line already there, so running it
 * again updates the counts rather than adding a second line. When the month
 * has no heading, the plan is to add one first, as `planWinsInsert` does.
 */
export function planWinsSummary(doc: DocsDocument, month: Month, text: string): Plan {
  const line = text.trim().replace(/^[_*]+|[_*]+$/g, "").trim();
  if (line === "") throw new Error("The line is empty.");
  const created = planWinsInsert(doc, month, [{ level: 0, text: line, links: [] }]);
  if (created.kind === "create") return created;

  const paras = paragraphs(doc);
  const at = paras.findIndex((para) => headingMonth(para) === month);
  const heading = paras[at];
  const next = paras[at + 1];
  const element = doc.body.content.find((el) => el.startIndex === next?.start);
  const runs = element?.paragraph?.elements.filter((part) => (part.textRun?.content ?? "").trim() !== "") ?? [];
  const existing =
    next !== undefined && !isHeading(next) && !next.bulleted && runs.length > 0 && runs.every((part) => part.textRun?.textStyle?.italic === true);

  const insertAt = heading.end - 1;
  const start = insertAt + 1;
  return {
    kind: "insert",
    heading: heading.text,
    headingId: heading.headingId,
    body: batch(doc, [
      ...(existing ? [{ deleteContentRange: { range: { startIndex: next.start, endIndex: next.end } } }] : []),
      { insertText: { location: { index: insertAt }, text: `\n${line}` } },
      { deleteParagraphBullets: { range: { startIndex: start, endIndex: start + line.length + 1 } } },
      {
        updateParagraphStyle: {
          range: { startIndex: start, endIndex: start + line.length + 1 },
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
          fields: "namedStyleType",
        },
      },
      { updateTextStyle: { range: { startIndex: start, endIndex: start + line.length }, textStyle: { italic: true }, fields: "*" } },
    ]),
  };
}
