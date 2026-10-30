import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import { useState } from "react";
import type * as React from "react";

import { priorityThreadId, type PriorityWeek } from "./now/priorities";
import { PrioritiesSidebar } from "./now/priorities-sidebar";

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

/** One priority already has a thread, so its button opens it. */
const threads = { [priorityThreadId("2026-10-05", "Review project plans with the team")]: "thread-1" };

/** Checking a box or opening the list here changes only the story. */
function Box({ initial, initialOpen }: { initial: PriorityWeek | null; initialOpen: boolean }) {
  const [current, setCurrent] = useState(initial);
  const [open, setOpen] = useState(initialOpen);
  return (
    <PrioritiesSidebar
      week={current}
      now={now}
      open={open}
      onOpenChange={setOpen}
      threads={threads}
      onStartThread={() => {}}
      onOpenThread={() => {}}
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

/** bb's sidebar footer box: rounded and bordered, as wide as the sidebar, at most 320px tall. */
function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-[268px] bg-sidebar p-2">
      <div className="max-h-80 overflow-auto rounded-lg border border-sidebar-border bg-sidebar-accent/50">{children}</div>
    </div>
  );
}

/** The box in bb's sidebar, on every page: closed, it counts the week's priorities beside a ring filled by those checked off; opened, it lists them. */
export function Default() {
  return (
    <StoryCard>
      <StoryRow label="Closed" hint="One line, with a ring for the one priority checked off. The arrow opens the list, and the choice is remembered across reloads.">
        <Footer>
          <Box initial={week} initialOpen={false} />
        </Footer>
      </StoryRow>
      <StoryRow
        label="Open"
        hint="Checked: struck through, still showing its hours. No time yet: linked workstreams got no hours this week. No hours line: nothing linked to measure it. The icon after each priority starts a thread about it on bb's new-thread page; the third already has one, so its icon opens it."
      >
        <Footer>
          <Box initial={week} initialOpen />
        </Footer>
      </StoryRow>
    </StoryCard>
  );
}
