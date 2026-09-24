// The shape of a thread's overview, shared by the store, the RPC contract, and
// the band. Nothing here touches SQLite, the network, or the clock.

/**
 * `current` is the step being worked on now. At most one step per thread holds
 * it, so the band can say "Step 2 of 4" without having to choose.
 */
export type StepStatus = "todo" | "current" | "done";

/**
 * Who created the step. The agent can mark any step done but remove none;
 * you can remove only your own, from the band.
 */
export type StepSource = "agent" | "user";

export type Step = {
  id: string;
  threadId: string;
  text: string;
  status: StepStatus;
  source: StepSource;
  /** Sort key within a thread. Monotonic, never reused, gaps are fine. */
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type Overview = {
  threadId: string;
  /** Empty until the agent or you write one. */
  summary: string;
  steps: Step[];
  /** Latest change to the summary or any step, by anyone. 0 when nothing yet. */
  updatedAt: number;
};

/** Longest step text we store. Longer arrives elided rather than rejected. */
export const TEXT_MAX = 500;

/** Longest summary we store: a few sentences, not a document. */
export const SUMMARY_MAX = 1000;

/**
 * The most steps one add may create. A model that wants more than this in one
 * go is enumerating edits rather than describing a plan.
 */
export const ADD_MAX = 50;
