import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import { AppPageHeader } from "@bb-app/components/layout/AppPageHeader";
import { SidebarProvider } from "@bb-app/components/ui/sidebar";

import { GoalCard, GoalLine, SidebarGoalMark } from "./components/goal-line";
import { GoalOutcomes, type GoalOutcomesData } from "./components/goal-outcomes";
import type { GoalViewData } from "./usage/contract";

export default { title: "tokenomics/Goals" };

const TASK: GoalViewData = {
  id: 1,
  shape: "task",
  text: "Export a widget list to CSV from the toolbar",
  stages: ["Export built", "Tests pass", "Reloaded in bb"],
  reached: 1,
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
  stages: [],
  reached: 0,
  label: "Exploring",
  estimate: { turns: null, tokens: null, minutes: null },
  left: null,
};

const MET: GoalViewData = { ...TASK, reached: 3, outcome: "met", outcomeNote: "Merged as acme/widgets#42", label: "Met", left: null };

function Header({ title, goal }: { title: string; goal: GoalViewData }) {
  return (
    <SidebarProvider>
      <div data-screenshot-frame className="w-[760px] border border-border bg-background">
        <AppPageHeader
          ownsWindowTopLeft={false}
          center={
            <div className="relative min-w-0">
              <p className="relative min-w-0 truncate text-sm font-normal">
                <span className="bb-thread-title">{title}</span>
              </p>
              <div className="min-w-0 max-w-full overflow-hidden">
                <GoalLine goal={goal} />
              </div>
            </div>
          }
        />
      </div>
    </SidebarProvider>
  );
}

/** The goal line under a thread's title: the goal, its current stage, and the turns left. */
export const GoalLineInHeader = () => <Header title="Widgets: export the list to CSV" goal={TASK} />;

/** Each kind of goal on the line: a task under way, one past its estimate, an exploration, and a met goal. */
export const GoalLineStates = () => (
  <StoryCard>
    <StoryRow label="a task" hint="stage reached and turns left">
      <GoalLine goal={TASK} />
    </StoryRow>
    <StoryRow label="past its estimate" hint="the turns left turn amber">
      <GoalLine goal={OVER} />
    </StoryRow>
    <StoryRow label="an exploration" hint="a question, no stages">
      <GoalLine goal={EXPLORING} />
    </StoryRow>
    <StoryRow label="met" hint="the outcome replaces the stage">
      <GoalLine goal={MET} />
    </StoryRow>
  </StoryCard>
);

/** The card that opens on the line: the stages, what the goal has used against its estimate, and how to change it. */
export const GoalCardOpen = () => (
  <StoryCard>
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

/** The mark beside a sidebar row's title: stages done, a question, or the outcome. */
export const SidebarMarks = () => (
  <StoryCard>
    {[
      { title: "Widgets: export the list to CSV", mark: { label: TASK.label!, outcome: null, left: TASK.left } },
      { title: "Gadget sync ADR", mark: { label: OVER.label!, outcome: null, left: OVER.left } },
      { title: "Cache for widget imports?", mark: { label: "Exploring", outcome: null, left: null } },
      { title: "Fix the widget snapshot test", mark: { label: "Met", outcome: "met" as const, left: null } },
    ].map(({ title, mark }) => (
      <StoryRow key={title} label={title}>
        <div className="flex w-[240px] items-center text-sm">
          <span className="min-w-0 truncate">{title}</span>
          <SidebarGoalMark {...mark} />
        </div>
      </StoryRow>
    ))}
  </StoryCard>
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
