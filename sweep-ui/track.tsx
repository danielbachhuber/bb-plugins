import type { ReactNode } from "react";

import { cn } from "./lib/cn";
import type { Stage } from "./types";

/** Every row's track, and the header naming its stages, share this width so the columns line up. */
export const TRACK_WIDTH = "w-[18rem]";

export interface TrackProps {
  stages: Stage[];
  /** Index into `stages`, or null when the row is on none of them. */
  stage: number | null;
  /** Shown in place of the track when `stage` is null. */
  offTrack?: ReactNode;
  /** Makes each dot a button that moves the row to its stage. */
  onMove?: (stage: number) => void;
}

/** The line through every stage, and the row's dot in its own, with the stages before it filled in. */
export function Track({ stages, stage, offTrack, onMove }: TrackProps) {
  if (stage === null) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center text-xs text-muted-foreground", TRACK_WIDTH)}>
        {offTrack}
      </div>
    );
  }
  const n = stages.length;
  const edge = `${50 / n}%`;
  const color = stages[stage]?.color;
  return (
    <div
      className={cn("relative grid shrink-0 items-center self-center", TRACK_WIDTH)}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      <span className="absolute top-1/2 h-px bg-border" style={{ left: edge, right: edge }} aria-hidden="true" />
      {stage > 0 ? (
        <span
          className={cn("absolute top-1/2 h-0.5 -translate-y-1/2", color)}
          style={{ left: edge, width: `${(stage / n) * 100}%` }}
          aria-hidden="true"
        />
      ) : null}
      {stages.map((each, index) => {
        const dot =
          index === stage ? (
            <span className={cn("size-3 rounded-full ring-2 ring-card", color)} />
          ) : (
            <span className={cn("size-1.5 rounded-full", index < stage ? color : "bg-border")} />
          );
        if (!onMove) {
          return (
            <span key={each.name} className="relative flex justify-center py-1" title={each.name}>
              {dot}
            </span>
          );
        }
        return (
          <button
            key={each.name}
            type="button"
            aria-label={`Move to ${each.name}`}
            aria-current={index === stage ? "step" : undefined}
            title={each.name}
            onClick={() => {
              if (index !== stage) onMove(index);
            }}
            className="relative flex justify-center rounded py-1 hover:bg-state-hover"
          >
            {dot}
          </button>
        );
      })}
    </div>
  );
}

/** The stage names above the tracks, with the list's own label on the left. */
export function TrackHeader({ stages, label }: { stages: Stage[]; label: ReactNode }) {
  return (
    <div className="flex items-end gap-3 px-4 pb-1.5 text-xs font-medium text-muted-foreground">
      <span className="flex flex-1 items-center gap-3 pl-8">{label}</span>
      <div
        className={cn("grid shrink-0 text-center", TRACK_WIDTH)}
        style={{ gridTemplateColumns: `repeat(${stages.length}, 1fr)` }}
      >
        {stages.map((stage) => (
          <span key={stage.name} className="truncate">
            {stage.name}
          </span>
        ))}
      </div>
    </div>
  );
}
