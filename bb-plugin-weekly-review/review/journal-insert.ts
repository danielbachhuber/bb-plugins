/**
 * Plans the Google Docs requests that add one entry, a bullet and its nested
 * bullets, to a section of a week in the journal doc. Pure: it reads the
 * document as `documents.get` returns it and returns `batchUpdate` requests,
 * so it can be tested without Google. `server.ts` makes the calls.
 *
 * The doc is newest first, one heading per week, and under it plain lines
 * ending in a colon (`Done:`, `Next:`) each followed by a bulleted list.
 */
import { addDays, fromDay } from "./dates.js";
import { parseHeadingDate } from "./meeting-notes.js";
import type { Day } from "./types.js";

export interface DocsParagraph {
  elements: Array<{ textRun?: { content?: string } }>;
  paragraphStyle?: { namedStyleType?: string; headingId?: string };
  bullet?: { listId: string; nestingLevel?: number };
}

export interface DocsElement {
  startIndex?: number;
  endIndex: number;
  paragraph?: DocsParagraph;
}

export interface DocsDocument {
  revisionId?: string;
  body: { content: DocsElement[] };
}

/** One line of the entry: how deep it sits, its text, and where its links are. */
export interface EntryLine {
  level: number;
  text: string;
  links: Array<{ start: number; end: number; url: string }>;
}

const BULLET = /^([ \t]*)[-*]\s+(.*)$/;
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/;

/**
 * Reads an entry written as markdown bullets: `-` per line, two spaces (or a
 * tab) per level. Links become link ranges; backticks and bold markers are
 * dropped, since the doc does not use them. A line that is not a bullet
 * continues the one above it.
 */
export function parseEntry(markdown: string): EntryLine[] {
  const lines: EntryLine[] = [];
  for (const raw of markdown.split(/\r?\n/)) {
    if (raw.trim() === "") continue;
    const match = BULLET.exec(raw);
    if (match === null) {
      const last = lines[lines.length - 1];
      if (last === undefined) continue;
      const more = inline(raw.trim());
      const offset = last.text.length + 1;
      last.text += ` ${more.text}`;
      last.links.push(...more.links.map((link) => ({ ...link, start: link.start + offset, end: link.end + offset })));
      continue;
    }
    const indent = match[1].replace(/\t/g, "  ").length;
    const previous = lines[lines.length - 1];
    // A line can sit at most one level under the one above it.
    const level = Math.min(Math.floor(indent / 2), previous === undefined ? 0 : previous.level + 1);
    lines.push({ level, ...inline(match[2].trim()) });
  }
  return lines;
}

function inline(source: string): Omit<EntryLine, "level"> {
  const plain = source.replace(/`([^`]*)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1");
  let text = "";
  const links: EntryLine["links"] = [];
  let rest = plain;
  for (let match = LINK.exec(rest); match !== null; match = LINK.exec(rest)) {
    text += rest.slice(0, match.index);
    links.push({ start: text.length, end: text.length + match[1].length, url: match[2] });
    text += match[1];
    rest = rest.slice(match.index + match[0].length);
  }
  return { text: text + rest, links };
}

interface Para {
  start: number;
  end: number;
  text: string;
  style: string;
  headingId: string | undefined;
  bulleted: boolean;
}

function paragraphs(doc: DocsDocument): Para[] {
  return doc.body.content.flatMap((element) => {
    const paragraph = element.paragraph;
    if (paragraph === undefined || element.startIndex === undefined) return [];
    return [{
      start: element.startIndex,
      end: element.endIndex,
      text: paragraph.elements.map((part) => part.textRun?.content ?? "").join("").replace(/\n$/, ""),
      style: paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT",
      headingId: paragraph.paragraphStyle?.headingId,
      bulleted: paragraph.bullet !== undefined,
    }];
  });
}

const isHeading = (para: Para) => para.style.startsWith("HEADING_") || para.style === "TITLE";
const headingRank = (para: Para) => (para.style === "TITLE" ? 0 : Number(para.style.slice("HEADING_".length)));
const sameLabel = (text: string, label: string) =>
  text.trim().replace(/:$/, "").toLowerCase() === label.trim().replace(/:$/, "").toLowerCase();

interface DatedHeading {
  index: number;
  day: Day;
}

function datedHeadings(paras: Para[], near: Day): DatedHeading[] {
  return paras.flatMap((para, index) => {
    if (!isHeading(para)) return [];
    const day = parseHeadingDate(para.text, near);
    return day === null ? [] : [{ index, day }];
  });
}

/** `October 9, 2026`: the week's Friday, as the doc writes its headings. */
export function headingFor(monday: Day): string {
  return fromDay(addDays(monday, 4)).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** A `batchUpdate` body. The revision check makes Google refuse it if the doc changed since it was read. */
export interface BatchBody {
  requests: object[];
  writeControl?: { requiredRevisionId: string };
}

export type Plan =
  /** The week has no entry yet: add one, read the doc again, and plan again. */
  | { kind: "create"; body: BatchBody; heading: string }
  | { kind: "insert"; body: BatchBody; heading: string; headingId: string | undefined };

/**
 * The requests that put `lines` at the end of `section` in the week's entry.
 * When the week has no entry, the plan is to create one first, above the
 * newest older entry, with the section labels that entry has.
 */
export function planInsert(doc: DocsDocument, week: { from: Day; to: Day }, section: string, lines: EntryLine[]): Plan {
  if (lines.length === 0) throw new Error("The entry has no bullets.");
  const paras = paragraphs(doc);
  const dated = datedHeadings(paras, week.from);
  const inWeek = dated.filter((heading) => heading.day >= week.from && heading.day <= week.to);
  const entry = inWeek[inWeek.length - 1];
  const body = (requests: object[]): BatchBody =>
    doc.revisionId === undefined ? { requests } : { requests, writeControl: { requiredRevisionId: doc.revisionId } };

  if (entry === undefined) {
    const below = dated.find((heading) => heading.day < week.from);
    if (below === undefined) throw new Error(`There is no earlier entry to copy the sections of, so no entry for ${week.from} was added.`);
    const heading = headingFor(week.from);
    return { kind: "create", heading, body: body(createEntry(paras, below.index, heading)) };
  }

  const heading = paras[entry.index];
  const rank = headingRank(heading);
  let endOfEntry = paras.findIndex((para, index) => index > entry.index && isHeading(para) && headingRank(para) <= rank);
  if (endOfEntry === -1) endOfEntry = paras.length;

  const labelAt = paras.findIndex(
    (para, index) => index > entry.index && index < endOfEntry && !para.bulleted && sameLabel(para.text, section),
  );
  if (labelAt === -1) throw new Error(`The entry under "${heading.text}" has no "${section}:" line.`);

  let anchor = labelAt;
  while (anchor + 1 < endOfEntry && paras[anchor + 1].bulleted) anchor += 1;

  return {
    kind: "insert",
    heading: heading.text,
    headingId: heading.headingId,
    body: body(bulletRequests(paras[anchor].end - 1, lines)),
  };
}

/**
 * The Docs API sets a new bullet's level from its leading tabs, counted from
 * the level of the list item just above it. So the new paragraphs go in after
 * a spare empty one that is not in a list, which makes their tabs count from
 * zero, and the spare is deleted once they have bullets. They form a list of
 * their own, with the same glyphs and indents as the one above.
 *
 * Inserted after a list item, the new paragraphs start out copying its bullet
 * and indent, so both are cleared first. The tabs are removed as the bullets
 * are made, so the link ranges are counted without them.
 */
function bulletRequests(at: number, lines: EntryLine[]): object[] {
  const inserted = "\n" + lines.map((line) => `\n${"\t".repeat(line.level)}${line.text}`).join("");
  const spare = { startIndex: at + 1, endIndex: at + 2 };
  const all = { startIndex: at + 1, endIndex: at + inserted.length };
  const added = { startIndex: at + 2, endIndex: at + inserted.length };
  const start = at + 2;
  const finalLength = lines.reduce((sum, line) => sum + line.text.length + 1, 0) - 1;

  const links: object[] = [];
  let offset = start;
  for (const line of lines) {
    for (const link of line.links) {
      links.push({
        updateTextStyle: {
          range: { startIndex: offset + link.start, endIndex: offset + link.end },
          textStyle: { link: { url: link.url } },
          fields: "link",
        },
      });
    }
    offset += line.text.length + 1;
  }

  return [
    { insertText: { location: { index: at }, text: inserted } },
    { deleteParagraphBullets: { range: all } },
    {
      updateParagraphStyle: {
        range: all,
        paragraphStyle: {
          namedStyleType: "NORMAL_TEXT",
          indentStart: { magnitude: 0, unit: "PT" },
          indentFirstLine: { magnitude: 0, unit: "PT" },
        },
        fields: "namedStyleType,indentStart,indentFirstLine",
      },
    },
    { createParagraphBullets: { range: added, bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } },
    // The new text would otherwise carry on the style where it was inserted,
    // such as a link that ended the paragraph above.
    { updateTextStyle: { range: { startIndex: start, endIndex: start + finalLength }, textStyle: {}, fields: "*" } },
    ...links,
    { deleteContentRange: { range: spare } },
  ];
}

/** A heading and the label lines of the entry below it, each followed by a blank line. */
function createEntry(paras: Para[], belowIndex: number, heading: string): object[] {
  const below = paras[belowIndex];
  const rank = headingRank(below);
  const labels: string[] = [];
  for (let index = belowIndex + 1; index < paras.length; index++) {
    const para = paras[index];
    if (isHeading(para) && headingRank(para) <= rank) break;
    if (!para.bulleted && para.text.trim().endsWith(":")) labels.push(para.text.trim());
  }
  const text = [heading, "", ...labels.flatMap((label) => [label, ""]), ""].join("\n") + "\n";
  const at = below.start;
  return [
    { insertText: { location: { index: at }, text } },
    {
      updateParagraphStyle: {
        range: { startIndex: at + heading.length + 1, endIndex: at + text.length },
        paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
        fields: "namedStyleType",
      },
    },
    {
      updateParagraphStyle: {
        range: { startIndex: at, endIndex: at + heading.length + 1 },
        paragraphStyle: { namedStyleType: below.style },
        fields: "namedStyleType",
      },
    },
  ];
}
