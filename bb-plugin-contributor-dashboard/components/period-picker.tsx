// The span control every page shares: the presets, then a range for the
// question they do not answer. Choosing a preset drops the custom range, so
// the two never both look selected.
import { Segmented } from "component-library/segmented";
import { DateRange, type DayRange } from "component-library/date-range";

import { BACKFILL_MS, PRESETS, type PresetId, type Selection } from "@/dashboard/period";

export function PeriodPicker({
  selection,
  onSelect,
  now = Date.now(),
}: {
  selection: Selection;
  onSelect: (selection: Selection) => void;
  now?: number;
}) {
  const custom: DayRange | null = selection.kind === "custom" ? { from: selection.from, to: selection.to } : null;

  return (
    <span className="inline-flex items-center gap-2">
      <Segmented
        label="Period"
        options={PRESETS}
        // A custom range matches no button, so none is lit.
        value={(selection.kind === "preset" ? selection.id : "") as PresetId}
        onChange={(id) => onSelect({ kind: "preset", id })}
      />
      <DateRange
        value={custom}
        onChange={({ from, to }) => onSelect({ kind: "custom", from, to: Math.min(to, now) })}
        // The mirror reaches back two years, so earlier days have nothing to draw.
        earliest={now - BACKFILL_MS}
        latest={now}
      />
    </span>
  );
}
