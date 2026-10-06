/**
 * What the previous entry said would matter this week: the bullets under its
 * `Next:` line. Pure, so it is tested against the shape of a real entry.
 */
import { z } from "zod";
import { datedSections, type DatedSection } from "./meeting-notes.js";
import type { Workstream, Rule } from "./workstreams.js";

/**
 * The entry written for a week: the last dated section that falls inside it,
 * since an entry is usually dated the day it was written up, not the Monday.
 * Null when there is none or it is empty.
 */
export function entryIn(text: string, from: string, to: string): DatedSection | null {
  const inWeek = datedSections(text, from).filter((section) => section.day >= from && section.day <= to);
  const section = inWeek[inWeek.length - 1];
  return section === undefined || section.body.trim() === "" ? null : section;
}

export interface PriorityDetail {
  text: string;
  /** 1 for a bullet directly under the priority, 2 for one under that, and so on. */
  depth: number;
}

export interface Priority {
  /** The top-level bullet, which is also the priority's key for its links. */
  text: string;
  /** Bullets nested under it, in order, each with how deep it sits. */
  details: PriorityDetail[];
}

const NEXT = /^\s*(?:\*\*)?next:?(?:\*\*)?:?\s*$/i;
const BULLET = /^(\s*)[-*•]\s+(.*)$/;

/**
 * The top-level bullets after a line reading `Next:`, each with what is
 * nested under it. Stops at the first line that is neither a bullet nor
 * blank, which is the next heading or paragraph.
 */
export function nextBullets(entryText: string): Priority[] {
  const lines = entryText.split(/\r?\n/);
  const start = lines.findIndex((line) => NEXT.test(line));
  if (start === -1) return [];

  const priorities: Priority[] = [];
  let topIndent: number | null = null;
  // The indents open above the current line, the priority's own first.
  let open: number[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") continue;
    const bullet = BULLET.exec(line);
    if (bullet === null) break;
    const indent = bullet[1].replace(/\t/g, "  ").length;
    const text = bullet[2].trim();
    topIndent ??= indent;
    if (indent <= topIndent || priorities.length === 0) {
      priorities.push({ text, details: [] });
      open = [indent];
    } else {
      while (open.length > 1 && open[open.length - 1]! >= indent) open.pop();
      open.push(indent);
      priorities[priorities.length - 1].details.push({ text, depth: open.length - 1 });
    }
  }
  return priorities;
}

/**
 * Workstreams a priority probably means: one whose name, or one of whose
 * phrase rules, appears in the bullet or under it. A suggestion only; the
 * link is made by hand.
 */
export function suggestLinks(
  priority: Priority,
  workstreams: Array<Workstream & { rules: Rule[] }>,
): number[] {
  const text = [priority.text, ...priority.details.map((detail) => detail.text)].join(" ").toLowerCase();
  return workstreams
    .filter((workstream) => workstream.retiredAt === null)
    .filter((workstream) =>
      [workstream.name, ...workstream.rules.filter((rule) => rule.type === "phrase").map((rule) => rule.value)]
        .some((needle) => needle.trim().length >= 3 && text.includes(needle.trim().toLowerCase())))
    .map((workstream) => workstream.id);
}

/** One proposed rule, as the rules agent writes it. */
export const ruleProposalSchema = z.object({
  /** An existing workstream's name, or a new one to create on accepting. */
  workstream: z.string().trim().min(1).max(120),
  type: z.enum(["ref", "task", "label", "phrase"]),
  value: z.string().trim().min(1).max(200),
  /** What the rule would catch and why it belongs there. */
  reason: z.string().trim().min(1).max(400),
});

export type RuleProposal = z.infer<typeof ruleProposalSchema>;
