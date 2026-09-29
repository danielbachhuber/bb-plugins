import type { ReactNode } from "react";

import { Icon } from "./icons";
import { cn } from "./lib/cn";
import type { Stage } from "./types";

/** Every row's track shares this width so the columns line up down the list. */
export const TRACK_WIDTH = "w-[18rem]";

export interface TrackProps {
  stages: Stage[];
  /** Index into `stages`, or null when the row is on none of them. */
  stage: number | null;
  /** Shown in place of the track when `stage` is null. */
  offTrack?: ReactNode;
  /** Makes each dot a button that moves the row to its stage. */
  onMove?: (stage: number) => void;
  /** The stage holding the row up: a red disc with a cross, and its name in red. */
  blocked?: number | null;
  /** The row is overdue: its dot and its stage's name are red. */
  late?: boolean;
}

/**
 * The line through every stage, the row's dot in its own with the stages
 * before it filled in, and each stage's name under its dot. The current
 * stage's name is bold; a blocked or late stage's is red.
 */
export function Track({ stages, stage, offTrack, onMove, blocked = null, late = false }: TrackProps) {
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
  const columns = { gridTemplateColumns: `repeat(${n}, 1fr)` };
  return (
    <div className={cn("shrink-0 self-center", TRACK_WIDTH)}>
      <div className="relative grid items-center" style={columns}>
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
            index === blocked ? (
              <span
                role="img"
                aria-label={`Blocked at ${each.name}`}
                className="flex size-3.5 items-center justify-center rounded-full bg-destructive ring-2 ring-card"
              >
                <Icon name="X" className="size-2.5 text-white" />
              </span>
            ) : index === stage ? (
              <span
                data-late={late || undefined}
                className={cn("size-3 rounded-full ring-2 ring-card", late ? "bg-destructive" : color)}
              />
            ) : (
              <span className={cn("size-1.5 rounded-full", index < stage ? color : "bg-border")} />
            );
          if (!onMove) {
            return (
              <span key={each.name} className="relative flex h-5 items-center justify-center" title={each.name}>
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
              className="relative flex h-5 items-center justify-center rounded hover:bg-state-hover"
            >
              {dot}
            </button>
          );
        })}
      </div>
      <div className="grid text-center text-[11px] leading-4" style={columns}>
        {stages.map((each, index) => (
          <span
            key={each.name}
            className={cn(
              "truncate",
              index === blocked || (late && index === stage)
                ? "font-medium text-destructive-text"
                : index === stage
                  ? "font-medium text-foreground"
                  : "text-muted-foreground/60",
            )}
          >
            {each.name}
          </span>
        ))}
      </div>
    </div>
  );
}
