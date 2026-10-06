import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import { useState } from "react";

import type { PriorityWeek } from "./now/priorities";
import { PrioritiesColumn, WithPriorities } from "./now/priorities-column";

export default {
  title: "now/Priorities",
};

/** Tuesday afternoon, after the 1pm gather. */
const now = new Date(2026, 9, 6, 15, 0);

const week: PriorityWeek = {
  monday: "2026-10-05",
  source: "weekly-review",
  heading: "From October 2, 2026",
  hoursAt: new Date(2026, 9, 6, 13, 0).toISOString(),
  writtenAt: new Date(2026, 9, 6, 13, 0).toISOString(),
  items: [
    { text: "Ship the widget export", details: [], hours: 6.5, doneAt: new Date(2026, 9, 6, 11, 0).toISOString() },
    { text: "Finish pagination for the gadgets list", details: [], hours: 0, doneAt: null },
    { text: "Review project plans with the team", details: [], hours: 1.5, doneAt: null },
    { text: "Plan the fall talk series", details: [], hours: null, doneAt: null },
    {
      text: "People:",
      details: [
        { text: "Octocat:", depth: 1 },
        { text: "Prepare the 1:1 agenda and ask about the widget sync handoff.", depth: 2 },
        { text: "Hubber:", depth: 1 },
        { text: "Write up feedback on the gadget launch plan.", depth: 2 },
      ],
      hours: 2,
      doneAt: null,
    },
  ],
};

/** Checking a box here changes only the story. */
function Column({ initial }: { initial: PriorityWeek | null }) {
  const [current, setCurrent] = useState(initial);
  return (
    <PrioritiesColumn
      week={current}
      now={now}
      onToggle={(text, done) =>
        setCurrent((value) =>
          value === null
            ? value
            : { ...value, items: value.items.map((each) => (each.text === text ? { ...each, doneAt: done ? now.toISOString() : null } : each)) },
        )
      }
    />
  );
}

/** Stand-in rows, so the layout shows where the list goes. */
function List() {
  return (
    <div className="space-y-2 px-4 py-3 md:px-5 md:py-4">
      {["Submit the widget grant report", "Reply to octocat about the widget launch date", "Look into gadget insurance", "Review the gadgets pull request"].map((title) => (
        <div key={title} className="rounded-md border border-border px-3 py-2 text-sm">
          {title}
        </div>
      ))}
    </div>
  );
}

/** The column beside Now's list: one priority checked off, one with no time yet, one not linked to any workstream, and one with bullets nested two levels deep. */
export function Default() {
  return (
    <StoryCard>
      <StoryRow
        label="States"
        hint="Checked: struck through, still showing its hours. No time yet: linked workstreams got no hours this week. No hours line: nothing linked to measure it."
      >
        <div className="w-64 rounded-lg border border-border bg-background p-4">
          <Column initial={week} />
        </div>
      </StoryRow>
    </StoryCard>
  );
}

/** Wide, the priorities sit to the right of the list, and dragging the column's left edge changes its width. Narrow, they move above it. */
export function Layout() {
  return (
    <StoryCard>
      <StoryRow label="Wide" hint="A column on the right, kept in view while the list scrolls.">
        <div className="w-[1000px] overflow-hidden rounded-lg border border-border bg-background">
          <WithPriorities priorities={<Column initial={week} />} initialWidth={256}>
            <List />
          </WithPriorities>
        </div>
      </StoryRow>
      <StoryRow label="Wide, widened" hint="The column dragged wider. The width is remembered across visits; double-clicking the edge puts it back.">
        <div className="w-[1000px] overflow-hidden rounded-lg border border-border bg-background">
          <WithPriorities priorities={<Column initial={week} />} initialWidth={400}>
            <List />
          </WithPriorities>
        </div>
      </StoryRow>
      <StoryRow label="Narrow" hint="Above the list, full width.">
        <div className="w-[560px] overflow-hidden rounded-lg border border-border bg-background">
          <WithPriorities priorities={<Column initial={week} />} initialWidth={256}>
            <List />
          </WithPriorities>
        </div>
      </StoryRow>
      <StoryRow label="No priorities" hint="A week with none written: no column, and the list keeps the full width.">
        <div className="w-[1000px] overflow-hidden rounded-lg border border-border bg-background">
          <WithPriorities priorities={null} initialWidth={256}>
            <List />
          </WithPriorities>
        </div>
      </StoryRow>
    </StoryCard>
  );
}
