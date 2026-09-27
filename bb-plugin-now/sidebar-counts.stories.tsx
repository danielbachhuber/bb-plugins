import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SidebarCounts } from "./now/sidebar-counts";

export default {
  title: "now/Sidebar counts",
};

function Row({ urgent, now }: { urgent: number; now: number }) {
  return (
    <div className="flex h-8 w-60 items-center justify-between rounded-md bg-sidebar px-2 text-sm text-sidebar-foreground">
      <span>Now</span>
      <span className="flex h-5 w-16 items-center justify-end overflow-hidden">
        <SidebarCounts urgent={urgent} now={now} />
      </span>
    </div>
  );
}

/** The counts beside Now in the sidebar: what needs a decision or is overdue in a red circle, then every row in the Now section, as its tab counts them. */
export function Default() {
  return (
    <StoryCard>
      <StoryRow label="Both" hint="Twelve rows in Now, four of which need a decision or are overdue.">
        <Row urgent={4} now={12} />
      </StoryRow>
      <StoryRow label="Urgent only" hint="The three rows in Now all need a decision or are overdue.">
        <Row urgent={3} now={3} />
      </StoryRow>
      <StoryRow label="Nothing urgent" hint="Nothing needs a decision or is overdue, so only the Now count shows.">
        <Row urgent={0} now={7} />
      </StoryRow>
      <StoryRow label="Large" hint="Two-digit counts on both sides still fit the sidebar's space.">
        <Row urgent={38} now={99} />
      </StoryRow>
      <StoryRow label="Empty" hint="Nothing in Now, so nothing shows.">
        <Row urgent={0} now={0} />
      </StoryRow>
    </StoryCard>
  );
}
