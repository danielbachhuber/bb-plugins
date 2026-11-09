// How a turn landed against Claude's forecast: a small bar with the 80% range
// shaded and a tick where the turn landed, and the words both the line under
// a turn and the strip above the composer use.
import type { CSSProperties } from "react";

import { verdict, type Verdict } from "@/usage/forecast";

/** Under the range reads in the tools blue, over in the warning amber. */
export const UNDER_COLOR = "#2a9fd6";

/** Text classes and style for a number that landed outside its range. */
export function verdictTone(v: Verdict): { className: string; style?: CSSProperties } {
  if (v === "over") return { className: "font-medium text-warning-text" };
  if (v === "under") return { className: "font-medium", style: { color: UNDER_COLOR } };
  return { className: "" };
}

/** "0.5", "4", "12": minutes with one decimal place only under ten. */
export function formatMinutes(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes > 0 && minutes < 0.05) return "<0.1";
  return minutes < 10 ? String(Math.round(minutes * 10) / 10) : String(Math.round(minutes));
}

export function RangeBar({
  actual,
  range,
  width = 40,
}: {
  actual: number;
  range: readonly [number, number];
  width?: number;
}) {
  const max = Math.max(actual, range[1], 1) * 1.15;
  const at = (value: number) => `${(value / max) * 100}%`;
  const v = verdict(actual, range);
  return (
    <span
      style={{ position: "relative", display: "inline-block", flexShrink: 0, height: 10, width }}
      aria-label={`${actual} against a forecast of ${range[0]} to ${range[1]}`}
      role="img"
    >
      <span style={{ position: "absolute", left: 0, right: 0, top: 4.5, height: 1, background: "var(--border)" }} />
      <span
        style={{
          position: "absolute",
          top: 1,
          bottom: 1,
          borderRadius: 2,
          left: at(range[0]),
          width: `calc(${at(range[1])} - ${at(range[0])})`,
          minWidth: 2,
          background: "color-mix(in srgb, var(--muted-foreground) 28%, transparent)",
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 3,
          borderRadius: 2,
          transform: "translateX(-50%)",
          left: at(actual),
          background: v === "over" ? "var(--warning)" : v === "under" ? UNDER_COLOR : "var(--foreground)",
        }}
      />
    </span>
  );
}
