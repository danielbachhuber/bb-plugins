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
  runtime: { label: "Working", activity: "working", note: "next segment pulses" },
  workflow: { label: "Workflow running", activity: "working", note: "next segment pulses" },
  "background-agent": { label: "Background agent", activity: "working", note: "next segment pulses" },
  "background-command": { label: "Background command", activity: "working", note: "next segment pulses" },
  "plan-mode": { label: "Plan mode", activity: "working", note: "next segment pulses" },
  goal: { label: "Codex goal active", activity: "working", note: "next segment pulses" },
  "working-draft": { label: "Working, with a draft", activity: "working", note: "pulses; draft in the card" },
  "waiting-for-input": { label: "Needs your input", activity: "waiting", note: "blue centre dot" },
  "queued-waiting": { label: "Message queued", activity: "queued", note: "hollow centre dot" },
  "unread-error": { label: "Failed, unread", activity: "error", note: "next segment red" },
  "queued-failed": { label: "Queued message failed", activity: "error", note: "next segment red" },
  "unread-success": { label: "Finished, unread", activity: "unread", note: "bb's dot, in the centre" },
  draft: { label: "Unsent draft", activity: "draft", note: "small stroke in the centre" },
  archived: { label: "Archived", activity: null, note: "donut shows the outcome" },
};
