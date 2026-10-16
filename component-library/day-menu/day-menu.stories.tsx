import { DayMenu, describeDay } from "./day-menu";

export default {
  title: "component-library/Day menu",
};

/** Thursday morning. */
const now = new Date(2026, 9, 15, 9, 30);
const noop = () => {};

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6" data-screenshot-frame>
      <div className="w-72 rounded-md border border-border bg-popover p-1 shadow-md">{children}</div>
    </div>
  );
}

/** As Review Sweep's Snooze draws it: three quick days with the day in words beside each, a box for any later day, and a note. */
export const Snooze = () => (
  <Frame>
    <DayMenu
      heading="Snooze until"
      choices={[
        { label: "Tomorrow", day: "2026-10-16" },
        { label: "Next week", day: "2026-10-19" },
        { label: "In two weeks", day: "2026-10-29" },
      ]}
      describe={(day) => describeDay(day, now)}
      check={(day) => (day > "2026-10-15" ? null : "Too early")}
      onPick={noop}
      now={now}
      menuLabel="Snooze until"
      inputLabel="Snooze until a day"
      footer="Comes back sooner if your review is requested again."
    />
  </Frame>
);
