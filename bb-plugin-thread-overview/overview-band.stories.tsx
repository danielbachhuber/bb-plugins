import { useState, type ReactNode } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import { HeaderFallback } from "./components/header-fallback";
import { OverviewBand, type OverviewHandlers } from "./components/overview-band";
import { nextStatus } from "./overview/steps";
import type { Overview, Step } from "./overview/types";

export default {
  title: "thread-overview/Band",
};

const NOW = Date.UTC(2026, 8, 24, 12, 0);

function step(position: number, text: string, status: Step["status"], source: Step["source"] = "agent"): Step {
  return { id: `s${position}`, threadId: "thr_story", text, status, source, position, createdAt: 0, updatedAt: 0 };
}

const planned: Overview = {
  threadId: "thr_story",
  summary:
    "Add a CSV export to the widgets report so the finance team can pull monthly totals without asking for a query. Open question: whether archived widgets belong in the totals.",
  steps: [
    step(1, "Find where the report builds its rows", "done"),
    step(2, "Write the export and its tests", "current"),
    step(3, "Decide how archived widgets are counted", "todo"),
    step(4, "Open a pull request", "todo"),
    step(5, "Ask finance which months they need first", "todo", "user"),
  ],
  updatedAt: NOW - 12 * 60_000,
};

/** A thread imported from Thread Todos: a long list, nearly all finished. */
const imported: Overview = {
  ...planned,
  summary: "",
  steps: [
    ...Array.from({ length: 14 }, (_, i) => step(i + 1, `Finished step ${i + 1}`, "done")),
    step(15, "Rebase onto main", "todo"),
    step(16, "Answer the review on the export format", "todo"),
  ],
  updatedAt: NOW - 3 * 24 * 3_600_000,
};

const empty: Overview = { ...planned, summary: "", steps: [], updatedAt: 0 };

/** Local state standing in for the RPC calls, so every control works. */
function useLocalOverview(initial: Overview): [Overview, OverviewHandlers] {
  const [overview, setOverview] = useState(initial);
  const update = (steps: Step[], summary = overview.summary) =>
    setOverview({ ...overview, steps, summary, updatedAt: NOW });
  return [
    overview,
    {
      onCycle: (target) => {
        const status = nextStatus(target.status);
        update(
          overview.steps.map((s) =>
            s.id === target.id
              ? { ...s, status }
              : status === "current" && s.status === "current"
                ? { ...s, status: "todo" }
                : s,
          ),
        );
      },
      onSaveSummary: (summary) => update(overview.steps, summary),
      onAdd: (text) =>
        update([...overview.steps, step(overview.steps.length + 100, text, "todo", "user")]),
      onRemove: (target) => update(overview.steps.filter((s) => s.id !== target.id)),
    },
  ];
}

/** bb's header row and the top of a transcript, so the band sits where it will. */
function Frame({ header, children }: { header?: ReactNode; children?: ReactNode }) {
  return (
    <div className="w-full max-w-[860px] overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex h-12 items-center gap-3 border-b border-border px-4">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Add CSV export to the widgets report
        </span>
        {header}
      </div>
      {children}
      <div className="px-6 py-4 text-sm text-muted-foreground">
        The finance team wants a CSV export on the widgets report. Can you add one?
      </div>
    </div>
  );
}

function Band({ initial, expanded: startExpanded = true }: { initial: Overview; expanded?: boolean }) {
  const [overview, handlers] = useLocalOverview(initial);
  const [expanded, setExpanded] = useState(startExpanded);
  return (
    <Frame>
      <OverviewBand
        overview={overview}
        now={NOW}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        {...handlers}
      />
    </Frame>
  );
}

function Fallback({ initial }: { initial: Overview }) {
  const [overview, handlers] = useLocalOverview(initial);
  return (
    <Frame
      header={
        <HeaderFallback overview={overview} now={NOW} isCompactViewport={false} {...handlers} />
      }
    />
  );
}

const ROW = "grid-cols-1 gap-y-2 px-0 md:grid-cols-[210px_minmax(0,1fr)]";

export const States = () => (
  <StoryCard>
    <StoryRow className={ROW} label="expanded" hint="click a step to cycle it; hover the summary for the pencil">
      <Band initial={planned} />
    </StoryRow>
    <StoryRow className={ROW} label="collapsed" hint="the summary on the left; the step count and current step on the right">
      <Band initial={planned} expanded={false} />
    </StoryRow>
    <StoryRow className={ROW} label="imported from Thread Todos" hint="unfinished steps first; finished ones wait behind Show 14 completed">
      <Band initial={imported} />
    </StoryRow>
    <StoryRow className={ROW} label="no overview yet" hint="one faint line, so a thread without one still has a way in">
      <Band initial={empty} />
    </StoryRow>
    <StoryRow className={ROW} label="header fallback" hint="drawn in the header row when the band cannot attach below it">
      <Fallback initial={planned} />
    </StoryRow>
  </StoryCard>
);
