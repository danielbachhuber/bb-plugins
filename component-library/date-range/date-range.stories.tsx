import { useState } from "react";

import { DateRange, type DayRange } from "./date-range";

export default {
  title: "component-library/Date range",
};

const NOW = new Date(2026, 9, 9, 14, 20).getTime();
const day = (month: number, date: number) => new Date(2026, month, date).getTime();

function Picker({ initial = null, defaultOpen }: { initial?: DayRange | null; defaultOpen?: boolean }) {
  const [value, setValue] = useState<DayRange | null>(initial);
  return (
    <div className="flex min-h-[26rem] justify-end p-4">
      <DateRange value={value} onChange={setValue} earliest={day(0, 1)} latest={NOW} defaultOpen={defaultOpen} />
    </div>
  );
}

/** Closed, with nothing picked: a button the width of its placeholder. */
export const Empty = () => <Picker />;

/** Closed, with a range applied: the button names the days it covers. */
export const Picked = () => <Picker initial={{ from: day(8, 19), to: day(9, 10) }} />;

/** Open on a range, two months at a time, with the days outside it disabled. */
export const Open = () => <Picker initial={{ from: day(8, 19), to: day(9, 10) }} defaultOpen />;

/** Open with nothing picked yet, so Apply is still disabled. */
export const OpenEmpty = () => <Picker defaultOpen />;
