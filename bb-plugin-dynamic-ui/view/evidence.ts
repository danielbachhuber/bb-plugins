// Where each claim of an item's evidence sits in its proposed text. Pure, so
// the marks can be tested without rendering.
import type { Evidence } from "./schema.js";

export interface ClaimSpan {
  start: number;
  end: number;
  evidence: Evidence;
  /** 1-based, in the item's order, for the marker. */
  number: number;
}

/** The claims found in one line of text, earliest first, without overlaps. */
export function claimSpans(line: string, evidence: Evidence[]): ClaimSpan[] {
  const spans: ClaimSpan[] = [];
  evidence.forEach((entry, i) => {
    const start = line.indexOf(entry.claim);
    if (start >= 0) spans.push({ start, end: start + entry.claim.length, evidence: entry, number: i + 1 });
  });
  spans.sort((a, b) => a.start - b.start);
  return spans.filter((span, i) => i === 0 || span.start >= spans[i - 1]!.end);
}

/** Each claim with its number, split by whether it is still in the text: one the user edited away is not. */
export function placeClaims(text: string, evidence: Evidence[]) {
  const numbered = evidence.map((entry, i) => ({ evidence: entry, number: i + 1 }));
  return {
    present: numbered.filter(({ evidence: entry }) => text.includes(entry.claim)),
    missing: numbered.filter(({ evidence: entry }) => !text.includes(entry.claim)),
  };
}

/** How many claims are fully, partly, and not supported. */
export function supportCounts(evidence: Evidence[]): Record<Evidence["support"], number> {
  const counts = { full: 0, partial: 0, none: 0 };
  for (const entry of evidence) counts[entry.support]++;
  return counts;
}

export const SUPPORT_LABEL: Record<Evidence["support"], string> = {
  full: "Supported",
  partial: "Partly supported",
  none: "Unsupported",
};

/** The evidence as markdown, for a thread started from the item. */
export function evidenceMarkdown(evidence: Evidence[]): string {
  return [
    "Evidence:",
    ...evidence.map((entry, i) =>
      [
        `${i + 1}. ${SUPPORT_LABEL[entry.support]}: "${entry.claim}"`,
        ...(entry.note === undefined ? [] : [`   - Doubt: ${entry.note}`]),
        ...entry.sources.map((source) => `   - "${source.quote}" (${source.url === undefined ? source.source : `[${source.source}](${source.url})`})`),
      ].join("\n"),
    ),
  ].join("\n");
}
