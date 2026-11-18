import type { ReactNode } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { ThreadStatusGlyph } from "@bb-app/components/thread/ThreadStatusGlyph";
import { CompactGoal, GoalCard, GoalDonut, SidebarGoalMark, type DonutActivity } from "./components/goal-line";
import { ThreadTokenCount } from "./components/thread-token-count";
import { AfterComposerFocus, LONG, LONG_TURNS, noop, NOW, ThreadFrame } from "./tokenomics.fixtures";
import { BB_STATE_LABELS, keepsBbIcon, ROW_STATES, type BbRowState } from "./components/row-activity";
import { GoalOutcomes, type GoalOutcomesData } from "./components/goal-outcomes";
import type { GoalViewData } from "./usage/contract";

export default { title: "tokenomics/Goals" };

const TASK: GoalViewData = {
  id: 1,
  shape: "task",
  text: "Export a widget list to CSV from the toolbar",
  stages: ["Export built", "Tests pass", "Reloaded in bb"],
  reached: 1,
  items: [],
  pr: null,
  setBy: "agent",
  setAt: 0,
  reason: null,
  outcome: null,
  outcomeNote: null,
  estimate: { turns: { low: 3, high: 8 }, tokens: { low: 5e6, high: 20e6 }, minutes: { low: 20, high: 60 } },
  spent: { turns: 2, tokens: 6.4e6, ms: 18 * 60_000 },
  label: "1 of 3 · Export built",
  left: "~1–6 turns left",
  revisions: 0,
};

const OVER: GoalViewData = {
  ...TASK,
  text: "Gadget sync decision recorded in an ADR and merged",
  stages: ["Options compared", "Review answered", "Merged"],
  reached: 2,
  label: "2 of 3 · Review answered",
  spent: { turns: 11, tokens: 48e6, ms: 95 * 60_000 },
  left: "past estimate",
  revisions: 1,
};

const EXPLORING: GoalViewData = {
  ...TASK,
  shape: "exploration",
  text: "Is a cache worth adding for widget imports?",
  stages: ["Answer recommended", "You decided"],
  reached: 1,
  label: "1 of 2 · Answer recommended",
  estimate: { turns: null, tokens: null, minutes: null },
  left: null,
};

const MET: GoalViewData = { ...TASK, reached: 3, outcome: "met", outcomeNote: "Merged as acme/widgets#42", label: "Met", left: null };

// The plugin's README embeds this one.
/** The token button in the thread header with the goal's donut before its sparkline, spinning while the thread works, and the summary it opens, which starts with the goal. */
export const GoalInHeader = () => (
  <ThreadFrame
    height="h-[760px]"
    headerAction={
      <AfterComposerFocus>
        <ThreadTokenCount usage={LONG} turns={LONG_TURNS} onOpenPage={noop} defaultOpen now={NOW.getTime()} goal={HEADER_GOAL} activity="working" spinDelay="-0.6s" />
      </AfterComposerFocus>
    }
  />
);

const HEADER_GOAL: GoalViewData = {
  ...TASK,
  text: "Export the widget list to CSV from the toolbar",
  stages: ["Export built", "Tests pass", "Reloaded in bb", "Refined on your feedback"],
  reached: 2,
  spent: { turns: 4, tokens: 9.1e6, ms: 26 * 60_000 },
  label: "2 of 4 · Tests pass",
  left: "~0–4 turns left",
};

const FINDINGS: GoalViewData["items"] = [
  { label: "C1 Debug login enabled in production", state: "done" },
  { label: "H1 Session cookie not marked Secure", state: "done" },
  { label: "H2 Admin route skips the role check", state: "done" },
  { label: "H3 Upload size not limited", state: "dropped" },
  { label: "H4 Message origin not checked", state: "current" },
  { label: "M1 Login posts tokens to any origin", state: "current" },
  { label: "M2 No rate limit on invites", state: "todo" },
  { label: "M3 Stack traces in API errors", state: "todo" },
  { label: "M4 Email preview page is public", state: "done" },
  { label: "M5 Stale CSRF token accepted", state: "todo" },
  { label: "M6 Any role counts as admin", state: "done" },
  { label: "L1 Request bodies logged", state: "todo" },
];

const REVIEWING: GoalViewData = {
  ...TASK,
  text: "Every finding from the widget security review has an issue or is dropped",
  stages: ["Findings triaged", "Issues filed"],
  reached: 1,
  items: FINDINGS,
  label: "1 of 2 · Findings triaged",
  left: "~2–6 turns left",
};

function SummaryTop({ goal, activity = null }: { goal: GoalViewData; activity?: DonutActivity }) {
  return (
    <div className="w-[400px] rounded-md border border-border bg-popover p-4">
      <CompactGoal goal={goal} activity={activity} />
    </div>
  );
}

/** The goal at the top of the summary: with its stages and then twelve items, waiting on you past its estimate, an exploration, and once met. */
export const CompactGoalStates = () => (
  <StoryCard>
    <StoryRow label="twelve items" hint="the stages, as the donut counts them, then a review's findings">
      <SummaryTop goal={REVIEWING} activity="working" />
    </StoryRow>
    <StoryRow label="past its estimate" hint="waiting on you; the turns left turn amber">
      <SummaryTop goal={OVER} activity="waiting" />
    </StoryRow>
    <StoryRow label="an exploration" hint="answer recommended, waiting on your call">
      <SummaryTop goal={EXPLORING} />
    </StoryRow>
    <StoryRow label="met" hint="the outcome in place of the count">
      <SummaryTop goal={MET} />
    </StoryRow>
  </StoryCard>
);

/** The card that opens on a sidebar donut: the stages, any items, what the goal has used against its estimate, and how to change it. */
export const GoalCardOpen = () => (
  <StoryCard>
    <StoryRow label="with items" hint="the stages, then the items">
      <div className="w-[320px] rounded-md border border-border bg-popover p-3">
        <GoalCard goal={REVIEWING} />
      </div>
    </StoryRow>
    <StoryRow label="a task" hint="one stage done">
      <div className="w-[320px] rounded-md border border-border bg-popover p-3">
        <GoalCard goal={TASK} />
      </div>
    </StoryRow>
    <StoryRow label="revised, past its estimate">
      <div className="w-[320px] rounded-md border border-border bg-popover p-3">
        <GoalCard goal={OVER} />
      </div>
    </StoryRow>
  </StoryCard>
);

/** The segmented donut at the right end of a sidebar row, in place of bb's icon: a segment per stage, amber past the estimate, an exploration's answer then your decision, a check once met, a cross when not met. */
export const SidebarMarks = () => (
  <StoryCard>
    {[
      { title: "Widgets: export the list to CSV", mark: { label: TASK.label!, stages: 3, reached: 1, outcome: null, left: TASK.left } },
      { title: "Goals in the thread", mark: { label: "4 of 5 · Built", stages: 5, reached: 4, outcome: null, left: "~0–8 turns left" } },
      { title: "Gadget sync ADR", mark: { label: OVER.label!, stages: 3, reached: 2, outcome: null, left: OVER.left } },
      { title: "Cache for widget imports?", mark: { label: "1 of 2 · Answer recommended", stages: 2, reached: 1, outcome: null, left: null } },
      { title: "Fix the widget snapshot test", mark: { label: "Met", stages: 2, reached: 2, outcome: "met" as const, left: null } },
      { title: "Retry the flaky upload", mark: { label: "Not met", stages: 3, reached: 1, outcome: "not" as const, left: null } },
    ].map(({ title, mark }) => (
      <StoryRow key={title} label={title}>
        <div className="flex w-[240px] items-center text-sm">
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <SidebarGoalMark mark={mark} />
        </div>
      </StoryRow>
    ))}
  </StoryCard>
);

/** Resting on the donut opens the goal's card beside the sidebar, here while the thread works. */
export const SidebarMarkHovered = () => (
  <div data-screenshot-frame className="h-[420px] w-[640px] bg-background p-6">
    <div className="flex w-[260px] items-center rounded-md bg-muted px-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate">Widgets: export the list to CSV</span>
      <SidebarGoalMark mark={{ label: TASK.label!, stages: 3, reached: 1, outcome: null, left: TASK.left }} state="runtime" loadGoal={async () => TASK} defaultOpen />
    </div>
  </div>
);

const OUTCOMES: GoalOutcomesData = {
  outcomes: [
    { outcome: "met", count: 14, medianTokens: 9.2e6, medianMinutes: 34 },
    { outcome: "partly", count: 3, medianTokens: 21e6, medianMinutes: 71 },
    { outcome: "not", count: 2, medianTokens: 4.1e6, medianMinutes: 12 },
  ],
  open: 6,
  byStart: [
    {
      origin: "pr-sweep threads",
      withGoal: { label: "with a goal", count: 12, medianTurns: 4, medianTokens: 7.5e6, medianMinutes: 22 },
      withoutGoal: { label: "without", count: 31, medianTurns: 6, medianTokens: 11e6, medianMinutes: 30 },
    },
    {
      origin: "threads with no plugin or parent",
      withGoal: { label: "with a goal", count: 5, medianTurns: 7, medianTokens: 18e6, medianMinutes: 48 },
      withoutGoal: { label: "without", count: 40, medianTurns: 4, medianTokens: 9e6, medianMinutes: 25 },
    },
  ],
  estimates: { turns: { inside: 13, of: 17 }, tokens: { inside: 11, of: 17 }, minutes: { inside: 9, of: 15 } },
};

/** The Goals section of the Tokenomics page: what each outcome cost, and threads with a goal against without. */
export const GoalsSection = () => (
  <div data-screenshot-frame className="w-[760px] bg-background p-4">
    <GoalOutcomes data={OUTCOMES} />
  </div>
);

/** The Goals section before any thread has recorded a goal. */
export const GoalsSectionEmpty = () => (
  <div data-screenshot-frame className="w-[760px] bg-background p-4">
    <GoalOutcomes
      data={{
        outcomes: OUTCOMES.outcomes.map((outcome) => ({ ...outcome, count: 0, medianTokens: null, medianMinutes: null })),
        open: 0,
        byStart: [],
        estimates: { turns: { inside: 0, of: 0 }, tokens: { inside: 0, of: 0 }, minutes: { inside: 0, of: 0 } },
      }}
    />
  </div>
);

// Every state bb's sidebar row icon can show, from ROW_STATES, which the
// typecheck holds to bb's own list of states.
const EVERY_BB_STATE = Object.keys(ROW_STATES) as BbRowState[];

const STATES_GRID = { gridTemplateColumns: "150px 270px 270px 170px" };

function SidebarRow({ trailing }: { trailing: ReactNode }) {
  return (
    <div style={{ width: 270 }} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm">
      <span className="text-orange-500">✳</span>
      <span className="min-w-0 flex-1 truncate">Widgets: export the list to CSV</span>
      <span className="flex h-4 min-w-4 shrink-0 items-center justify-end gap-1.5">{trailing}</span>
    </div>
  );
}

/** Every bb sidebar row state: bb's icon, and the goal donut that takes its place on a thread with a goal (3 of 5 stages done). The done arc takes bb's colour, the donut spins while working (a still shows it mid-turn), and a draft keeps bb's own icon. A failure or a queued message, such as a turn waiting to retry after a provider error, shows bb's icon alone. */
export const EveryBbRowState = () => (
  <div data-screenshot-frame className="inline-block bg-background p-6">
    <div className="mb-2 grid gap-x-4 text-xs text-muted-foreground" style={STATES_GRID}>
      <span>bb state</span>
      <span>Without a goal</span>
      <span>With a goal</span>
      <span>On the donut</span>
    </div>
    {EVERY_BB_STATE.map((state) => {
      const { label, note } = ROW_STATES[state];
      return (
        <div key={state} className="grid items-center gap-x-4" style={STATES_GRID}>
          <span className="text-xs">{label}</span>
          <SidebarRow
            trailing={state === "archived" ? <ThreadStatusGlyph indicator="none" archived /> : <ThreadStatusGlyph indicator={state} />}
          />
          <SidebarRow
            trailing={
              <>
              {state !== "archived" && keepsBbIcon(BB_STATE_LABELS[state] ?? null) ? <ThreadStatusGlyph indicator={state} /> : (
              <SidebarGoalMark
                mark={
                  state === "archived"
                    ? { label: "Met", stages: 5, reached: 5, outcome: "met", left: null }
                    : { label: "3 of 5 · Tests pass", stages: 5, reached: 3, outcome: null, left: null }
                }
                state={state}
              />
              )}
              </>
            }
          />

          <span className="text-xs text-muted-foreground">{note}</span>
        </div>
      );
    })}
  </div>
);

const REVIEW: GoalViewData = {
  ...TASK,
  text: "Review the widget export refactor and report findings",
  stages: ["Diff read and checked out", "Findings reported to the parent thread"],
  reached: 1,
  setBy: "spawner",
  estimate: { turns: { low: 1, high: 2 }, tokens: { low: 2e6, high: 8e6 }, minutes: { low: 15, high: 45 } },
  spent: { turns: 1, tokens: 4.3e6, ms: 6 * 60_000 },
  label: "1 of 2 · Diff read and checked out",
  left: "~0–1 turns left",
};

/** The goal card in each thread state: the stage being worked on shows what the thread is doing, as the donut does. */
export const CardInEachState = () => (
  <div data-screenshot-frame className="inline-flex flex-wrap gap-4 bg-background p-6" style={{ width: 1040 }}>
    {(["none", "runtime", "waiting-for-input", "unread-error", "queued-waiting"] as const).map((state) => (
      <div key={state} className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{ROW_STATES[state].label}</span>
        <div className="w-[320px] rounded-md border border-border bg-popover p-3 shadow-sm">
          <GoalCard goal={REVIEW} activity={ROW_STATES[state].activity} />
        </div>
      </div>
    ))}
  </div>
);

/** The donut while the thread works, for goals of one, two, and five stages: the stage being worked on is dashed, so the turning ring shows even with a single stage or none done yet (a still, mid-turn). */
export const WorkingDonuts = () => (
  <div data-screenshot-frame className="inline-flex flex-col gap-1 bg-background p-6">
    {[
      { stages: 1, reached: 0, label: "1 stage, none done" },
      { stages: 2, reached: 0, label: "2 stages, none done" },
      { stages: 2, reached: 1, label: "2 stages, 1 done" },
      { stages: 5, reached: 0, label: "5 stages, none done" },
      { stages: 5, reached: 3, label: "5 stages, 3 done" },
    ].map(({ stages, reached, label }) => (
      <div key={label} className="flex items-center gap-3">
        <SidebarRow trailing={<GoalDonut stages={stages} reached={reached} activity="working" spinDelay="-0.6s" />} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
    ))}
  </div>
);
