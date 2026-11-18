// What bb's own sidebar row icon says, as the goal donut shows it. On a
// thread with a goal the donut takes the icon's place, so every state bb can
// show needs one here. The record is keyed by the SDK's list of states, so a
// state bb adds fails the typecheck until it is mapped, and the "Every bb row
// state" story in goals.stories.tsx then draws it beside bb's own icon.
import type { PluginSidebarThreadIndicator } from "@get-bb/plugin-sdk/app";

import type { DonutActivity } from "./goal-line";

/** bb's states, plus archived, which bb draws from the thread rather than as a state. */
export type BbRowState = PluginSidebarThreadIndicator | "archived";

export const ROW_STATES: Record<BbRowState, { label: string; activity: DonutActivity; note: string }> = {
  none: { label: "Idle", activity: null, note: "bb shows nothing" },
  runtime: { label: "Working", activity: "working", note: "donut spins" },
  workflow: { label: "Workflow running", activity: "working", note: "donut spins" },
  "background-agent": { label: "Background agent", activity: "working", note: "donut spins" },
  "background-command": { label: "Background command", activity: "working", note: "donut spins" },
  "plan-mode": { label: "Plan mode", activity: "working", note: "donut spins" },
  goal: { label: "Codex goal active", activity: "working", note: "donut spins" },
  "working-draft": { label: "Working, with a draft", activity: "working", note: "donut spins" },
  "waiting-for-input": { label: "Needs your input", activity: "waiting", note: "done arc blue" },
  "queued-waiting": { label: "Message queued", activity: "queued", note: "bb's icon, no donut" },
  "unread-error": { label: "Failed, unread", activity: "error", note: "bb's icon, no donut" },
  "queued-failed": { label: "Queued message failed", activity: "error", note: "bb's icon, no donut" },
  "unread-success": { label: "Finished, unread", activity: "unread", note: "done arc darker" },
  draft: { label: "Unsent draft", activity: "draft", note: "bb's draft icon" },
  archived: { label: "Archived", activity: null, note: "donut shows the outcome" },
};

/**
 * bb's accessible label for each state's icon, as bb's thread-list plugin
 * writes them. The sidebar donut reads the label off bb's hidden icon to
 * know the thread's state.
 */
export const BB_STATE_LABELS: Record<Exclude<BbRowState, "none">, string> = {
  "unread-error": "Unread thread failed",
  "waiting-for-input": "Thread needs user input",
  "working-draft": "Thread working with unsubmitted draft",
  workflow: "Workflow running",
  "background-agent": "Background agent running",
  "background-command": "Background command running",
  "plan-mode": "Plan mode active",
  goal: "Goal active",
  runtime: "Thread working",
  "queued-failed": "Queued message failed to send",
  "queued-waiting": "Thread has a message waiting to send",
  draft: "Thread has unsubmitted draft",
  "unread-success": "Unread thread succeeded",
  archived: "Archived thread",
};

const STATE_BY_LABEL = new Map(Object.entries(BB_STATE_LABELS).map(([state, label]) => [label, state as BbRowState]));

/** The state behind bb's icon label; "none" with no icon or a label this doesn't know. */
export function rowStateOf(label: string | null | undefined): BbRowState {
  return (label && STATE_BY_LABEL.get(label)) || "none";
}

/**
 * bb's state, or waiting when the thread has an open Impromptu UI card above
 * its composer and bb shows it as idle or finished. bb counts only its own
 * questions and approvals as needing you; a card asking you to pick is the
 * same thing to the person reading the sidebar. A thread that is working,
 * failed, or holds a draft keeps bb's state.
 */
export function withOpenCard(state: BbRowState, openCard: boolean): BbRowState {
  return openCard && (state === "none" || state === "unread-success") ? "waiting-for-input" : state;
}

/**
 * States whose row shows bb's icon alone, with no donut: a failed turn, a
 * failed queued message, and a message waiting to send, which is how bb shows
 * a turn it will retry after a provider error. bb's icon says what went
 * wrong; the donut cannot, and the goal can wait until the thread runs again. A label this plugin does
 * not know keeps its icon too, so a state bb adds later is never hidden.
 */
const KEEPS_ICON: ReadonlySet<BbRowState> = new Set(["unread-error", "queued-failed", "queued-waiting"]);

export function keepsBbIcon(label: string | null): boolean {
  if (label === null) return false;
  const state = rowStateOf(label);
  return state === "none" || KEEPS_ICON.has(state);
}
