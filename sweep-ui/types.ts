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
  /**
   * Set aside with the On hold box in the note editor, drawn as "On hold" at
   * the start of the note. Left out or false when not.
   */
  onHold?: boolean;
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
   * True when the pull request conflicts with its base branch, drawn as a
   * warning triangle at the end of the title line, after the number.
   */
  conflicted?: boolean;
  progress?: { done: number; total: number } | null;
  /** The comment count, drawn in the action line after the progress bar. Left out or 0 for none. */
  comments?: number;
  /**
   * Drawn open whatever its tier, with no chevron to close it. For a row
   * whose action line holds something that must stay in view, such as a
   * running timer.
   */
  forceOpen?: boolean;
  /**
   * The stack on GitHub this pull request belongs to. Two or more rows in one
   * stack draw together as one block, bottom first, each as one line.
   */
  stack?: SweepStack | null;
}

/** A pull request's place in its stack, as the list groups it. */
export interface SweepStack {
  /** Unique in the list, such as `acme/widgets#731`. */
  key: string;
  /** The stack's own number in its repository: "Stack #N". */
  number: number;
  /** This pull request's place, 1 for the one closest to the base branch. */
  position: number;
  /** How many of the stack's pull requests are open, including ones not in the list. */
  open: number;
  /** The numbers of the stack's merged pull requests, bottom first. */
  merged: number[];
}

export interface Stage {
  name: string;
  /** Tailwind background class for the dot and line. */
  color: string;
}
