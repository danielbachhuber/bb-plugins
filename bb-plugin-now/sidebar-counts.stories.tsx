import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SidebarCounts } from "./now/sidebar-counts";

export default {
  title: "now/Sidebar counts",
};

function Row({ overdue, today, now }: { overdue: number; today: number; now: number }) {
  return (
    <div className="flex h-8 w-60 items-center justify-between rounded-md bg-sidebar px-2 text-sm text-sidebar-foreground">
      <span>Now</span>
      <span className="flex h-5 w-24 items-center justify-end overflow-hidden">
        <SidebarCounts overdue={overdue} today={today} now={now} />
      </span>
    </div>
  );
}

/** The counts beside Now in the sidebar: overdue tasks in a red circle, what to deal with today (Today, Me, and Requests) in a blue one, then every row in the Now section, as its tab counts them. */
export function Default() {
  return (
    <StoryCard>
      <StoryRow label="All three" hint="Forty rows in Now: four overdue and nineteen to deal with today.">
        <Row overdue={4} today={19} now={40} />
      </StoryRow>
      <StoryRow label="Nothing overdue" hint="Only the blue count and the total show.">
        <Row overdue={0} today={7} now={12} />
      </StoryRow>
      <StoryRow label="Nothing for today" hint="Only the red count and the total show.">
        <Row overdue={2} today={0} now={9} />
      </StoryRow>
      <StoryRow label="Only the total" hint="What is left can be archived or is minor, so neither circle shows.">
        <Row overdue={0} today={0} now={6} />
      </StoryRow>
      <StoryRow label="Large" hint="Two-digit counts in every place still fit the sidebar's space.">
        <Row overdue={38} today={45} now={99} />
      </StoryRow>
      <StoryRow label="Empty" hint="Nothing in Now, so nothing shows.">
        <Row overdue={0} today={0} now={0} />
      </StoryRow>
    </StoryCard>
  );
}
