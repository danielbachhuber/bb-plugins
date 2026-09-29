import type { ReactNode } from "react";

export type Tier = "now" | "next" | "later";

/** Now's five colors, by meaning. See the spec's color table. */
export type RunTone = "new" | "late" | "underway" | "next" | "later";

export type Flag =
  | { kind: "stale"; text: string }
  | { kind: "blocked"; text: string }
  | { kind: "problem"; text: string };

export interface Run {
  id: string;
  /** Lowercase noun phrase after the count: "new comments". */
  label: string;
  tone: RunTone;
  tier: Tier;
}

export interface SweepItem {
  /** `repo#number`, unique in the list. */
  key: string;
  runId: string;
  title: string;
  url: string;
  number: number;
  newComments: number;
  flags: Flag[];
  /** Short facts after the number and flags: "3h ago", "acme/gadgets". */
  facts: string[];
  parent: { number: number; title: string; url: string } | null;
  note: string | null;
  /** Index into the tab's stages, or null for off the track. */
  stage: number | null;
  /** Shown in place of the track when stage is null: "Add to board", "Stalled". */
  offTrack?: ReactNode;
  progress?: { done: number; total: number } | null;
}

export interface Stage {
  name: string;
  /** Tailwind background class for the dot and line. */
  color: string;
}
