import type { ReactNode } from "react";

import type { StackChipProps } from "./stack-chip";

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
  /** The same phrase after a count of one: "new comment". */
  labelOne: string;
  tone: RunTone;
  tier: Tier;
  /** A Tailwind background class for the run's squares, in place of its tone's. */
  color?: string;
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
  /**
   * The stage that is holding the row up, drawn as a red disc with a cross
   * and its name in red. Null or left out when nothing is.
   */
  blockedStage?: number | null;
  /** Drawn before the title, such as a pull request's state icon. */
  icon?: ReactNode;
  /**
   * Where a pull request sits in a stack of pull requests built on each
   * other's branches, drawn as a chip after the number. Left out when it is
   * not in one.
   */
  stack?: StackChipProps["stack"] | null;
  progress?: { done: number; total: number } | null;
  /** The comment count, drawn in the action line before the progress bar. Left out or 0 for none. */
  comments?: number;
  /**
   * Drawn open whatever its tier, with no chevron to close it. For a row
   * whose action line holds something that must stay in view, such as a
   * running timer.
   */
  forceOpen?: boolean;
}

export interface Stage {
  name: string;
  /** Tailwind background class for the dot and line. */
  color: string;
}
