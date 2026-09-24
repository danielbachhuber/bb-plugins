// The band under a thread's header, drawn from props alone so stories and
// tests can render every state without a server. app.tsx loads the overview
// and passes the handlers.

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { collapsedLine, isQuiet, stepColumn, updatedLabel } from "@/overview/steps";
import type { Overview, Step, StepStatus } from "@/overview/types";

export type OverviewHandlers = {
  onCycle: (step: Step) => void;
  onSaveSummary: (summary: string) => void;
  onAdd: (text: string) => void;
  onRemove: (step: Step) => void;
};

export function StepGlyph({ status }: { status: StepStatus }) {
  if (status === "done") {
    return <Icon name="CircleCheck" className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (status === "current") {
    return <Icon name="Target" className="size-3.5 shrink-0 text-foreground" />;
  }
  return <Icon name="Circle" className="size-3.5 shrink-0 text-muted-foreground/60" />;
}

/**
 * The band spans the pane; its contents sit in a centred column, so on a wide
 * screen the summary and the steps stay close together and near the transcript.
 */
const CONTENT_WIDTH = "mx-auto w-full max-w-[1040px]";

const STATUS_WORD: Record<StepStatus, string> = {
  todo: "not started",
  current: "current",
  done: "done",
};

/** One step in the column: click to cycle it; yours can be removed. */
function StepRow({ step, onCycle, onRemove }: { step: Step } & Pick<OverviewHandlers, "onCycle" | "onRemove">) {
  return (
    <li className="group/step flex items-start">
      <button
        type="button"
        onClick={() => onCycle(step)}
        aria-label={`${step.text}, ${STATUS_WORD[step.status]}. Click to change`}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 rounded px-1.5 py-0.5 text-left text-xs leading-5 hover:bg-state-hover",
          step.status === "current" && "bg-secondary font-medium text-foreground",
          step.status === "todo" && "text-foreground/80",
          step.status === "done" && "text-muted-foreground",
        )}
      >
        <span className="flex h-5 items-center">
          <StepGlyph status={step.status} />
        </span>
        <span className="min-w-0 break-words">{step.text}</span>
      </button>
      {step.source === "user" ? (
        <button
          type="button"
          aria-label={`Remove ${step.text}`}
          onClick={() => onRemove(step)}
          className="mt-0.5 cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 hover:bg-state-hover group-hover/step:opacity-100 focus-visible:opacity-100"
        >
          <Icon name="X" className="size-3" />
        </button>
      ) : null}
    </li>
  );
}

/**
 * The summary on the left and the steps in a scrolling column on its right,
 * unfinished above finished. In a narrow pane, or the fallback's popover, the
 * column wraps below the summary. Shared by the expanded band and the popover.
 */
export function OverviewBody({
  overview,
  now,
  onCycle,
  onSaveSummary,
  onAdd,
  onRemove,
  onCancel,
  initialMode = "idle",
}: {
  overview: Pick<Overview, "summary" | "steps" | "updatedAt">;
  now: number;
  initialMode?: "idle" | "summary" | "adding";
  /** Called when a summary edit is abandoned. */
  onCancel?: () => void;
} & OverviewHandlers) {
  const [mode, setMode] = useState(initialMode);
  const [draft, setDraft] = useState(overview.summary);
  const [newStep, setNewStep] = useState("");
  const { unfinished, finished } = stepColumn(overview.steps);
  const updated = updatedLabel(overview.updatedAt, now);

  const cancelSummary = () => {
    setMode("idle");
    onCancel?.();
  };

  const editSummary = () => {
    setDraft(overview.summary);
    setMode("summary");
  };

  const saveSummary = () => {
    onSaveSummary(draft);
    setMode("idle");
  };

  const submitStep = (event: FormEvent) => {
    event.preventDefault();
    const text = newStep.trim();
    if (text !== "") onAdd(text);
    setNewStep("");
    setMode("idle");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap gap-x-8 gap-y-2">
      {/* The band spans the pane; a summary line that long is hard to read. */}
      <div className="flex min-w-[14rem] max-w-[72ch] flex-[1_1_22rem] flex-col gap-1">
        {mode === "summary" ? (
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              saveSummary();
            }}
          >
            <textarea
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") cancelSummary();
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  saveSummary();
                }
              }}
              rows={3}
              aria-label="Thread summary"
              placeholder="What this thread is for, and any open question"
              className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-1.5">
              <Button type="submit" size="sm" className="h-7 cursor-pointer">
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 cursor-pointer"
                onClick={cancelSummary}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : overview.summary === "" ? (
          <button
            type="button"
            onClick={editSummary}
            className="cursor-pointer self-start text-sm text-muted-foreground hover:text-foreground"
          >
            No summary yet. Write one
          </button>
        ) : (
          <div className="group/summary flex items-start gap-1">
            <p className="min-w-0 text-sm leading-relaxed break-words">{overview.summary}</p>
            <button
              type="button"
              aria-label="Edit summary"
              onClick={editSummary}
              className="mt-0.5 shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground opacity-0 hover:bg-state-hover group-hover/summary:opacity-100 focus-visible:opacity-100"
            >
              <Icon name="Edit" className="size-3.5" />
            </button>
          </div>
        )}
        {updated !== "" ? <span className="text-xs text-muted-foreground/70">{updated}</span> : null}
      </div>

      <div className="flex min-w-[14rem] flex-[1_1_20rem] flex-col">
        {/* About seven rows; a longer plan scrolls rather than pushing the transcript down. */}
        <ol className="flex max-h-40 flex-col gap-px overflow-y-auto" aria-label="Steps">
          {unfinished.map((step) => (
            <StepRow key={step.id} step={step} onCycle={onCycle} onRemove={onRemove} />
          ))}
          <li className="px-1.5 py-0.5">
            {mode === "adding" ? (
              <form onSubmit={submitStep}>
                <input
                  autoFocus
                  value={newStep}
                  onChange={(event) => setNewStep(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setMode("idle");
                  }}
                  onBlur={() => {
                    if (newStep.trim() === "") setMode("idle");
                  }}
                  placeholder="New step"
                  aria-label="New step"
                  className="h-6 w-full rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setMode("adding")}
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              >
                + Add step
              </button>
            )}
          </li>
          {finished.map((step) => (
            <StepRow key={step.id} step={step} onCycle={onCycle} onRemove={onRemove} />
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * The one-line form, laid out like the expanded band: the summary on the left,
 * the step count and current step on the right. Each side is cut to fit, the
 * step side at most a third of the line.
 */
export function CollapsedLine({ overview }: { overview: Pick<Overview, "summary" | "steps"> }) {
  const line = collapsedLine(overview);
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-6 text-sm">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {line.summary !== "" ? line.summary : "No summary yet"}
      </span>
      {line.step !== "" ? (
        <span className="max-w-[33%] shrink-0 truncate">
          {line.count !== "" ? (
            <span className="text-muted-foreground tabular-nums">{line.count} </span>
          ) : null}
          <span className="font-medium">{line.step}</span>
        </span>
      ) : null}
    </span>
  );
}

export function OverviewBand({
  overview,
  now,
  expanded,
  onToggle,
  initialMode,
  ...handlers
}: {
  overview: Overview;
  now: number;
  expanded: boolean;
  onToggle: () => void;
  initialMode?: "idle" | "summary" | "adding";
} & OverviewHandlers) {
  const [writing, setWriting] = useState(false);

  if (isQuiet(overview) && !writing) {
    const done = overview.steps.length;
    return (
      <div className="border-b border-border px-4 py-1.5">
        <div className={cn(CONTENT_WIDTH, "flex items-center gap-2 text-xs text-muted-foreground/70")}>
          <Icon name="ListTodo" className="size-3.5 shrink-0" />
          <span>No overview yet</span>
          {done > 0 ? (
            <span>
              · {done} {done === 1 ? "step" : "steps"} done earlier
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setWriting(true)}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Write one
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Thread overview"
      className="border-b border-border bg-card/60 px-4 py-2"
    >
      <div className={cn(CONTENT_WIDTH, "flex items-start gap-2")}>
        <Icon name="ListTodo" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        {expanded || writing ? (
          <OverviewBody
            overview={overview}
            now={now}
            initialMode={writing ? "summary" : initialMode}
            {...handlers}
            onCancel={() => setWriting(false)}
            onSaveSummary={(summary) => {
              setWriting(false);
              handlers.onSaveSummary(summary);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 flex-1 cursor-pointer text-left"
          >
            <CollapsedLine overview={overview} />
          </button>
        )}
        {!writing ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={expanded ? "Collapse overview" : "Expand overview"}
            aria-expanded={expanded}
            className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-state-hover"
          >
            <Icon name="ChevronDown" className={cn("size-4", expanded && "rotate-180")} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
