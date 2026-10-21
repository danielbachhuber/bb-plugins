import type { ServiceState } from "../services/manifest";
import { cn } from "../lib/utils";

const STROKE_CLASS: Record<ServiceState, string> = {
  running: "stroke-success",
  starting: "stroke-amber-500",
  stopped: "stroke-muted-foreground/25",
  failed: "stroke-destructive",
};

/** One slice per service, in the order the bar lists them, colored by its state. */
export function ServicesDonut({
  states,
  size = 16,
  stroke = 3,
  className,
}: {
  states: ServiceState[];
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const slice = circumference / Math.max(states.length, 1);
  // A gap between slices, small enough that twelve still read as a ring.
  const gap = states.length > 1 ? Math.min(slice * 0.35, circumference * 0.12 / states.length + 1.2) : 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={cn("shrink-0 -rotate-90", className)}
    >
      {states.map((state, index) => (
        <circle
          key={index}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${slice - gap} ${circumference - slice + gap}`}
          strokeDashoffset={-index * slice}
          className={STROKE_CLASS[state]}
        />
      ))}
    </svg>
  );
}
