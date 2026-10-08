import { useState } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { Segmented, SegmentedToggle } from "./segmented";

export default {
  title: "component-library/Segmented",
};

const PERIODS = [
  { id: "1d", label: "Day" },
  { id: "3d", label: "3 days" },
  { id: "1w", label: "Week" },
] as const;

const SOURCES = [
  { id: "tasks", label: "Tasks", count: 14, title: "Todoist tasks due today or earlier" },
  { id: "email", label: "Email", count: 6, title: "Unread mail in the inbox" },
  { id: "github", label: "GitHub", count: 3, title: "Notifications per pull request or issue" },
] as const;

function PeriodPicker({ initial }: { initial: (typeof PERIODS)[number]["id"] }) {
  const [value, setValue] = useState(initial);
  return <Segmented label="Period" options={PERIODS} value={value} onChange={setValue} />;
}

function SourceFilter({ initial }: { initial: (typeof SOURCES)[number]["id"] | null }) {
  const [value, setValue] = useState(initial);
  return <SegmentedToggle label="Source" options={SOURCES} value={value} onChange={setValue} />;
}

/** Segmented picks one of a few choices, such as a period; one is always on. SegmentedToggle filters a list, and pressing the chosen option again turns the filter off. */
export const States = () => (
  <StoryCard>
    <StoryRow label="Segmented" hint="One choice is always on">
      <PeriodPicker initial="1w" />
    </StoryRow>
    <StoryRow label="Toggle, off" hint="Nothing chosen, so the list shows everything">
      <SourceFilter initial={null} />
    </StoryRow>
    <StoryRow label="Toggle, on" hint="With a count on each option">
      <SourceFilter initial="email" />
    </StoryRow>
  </StoryCard>
);
