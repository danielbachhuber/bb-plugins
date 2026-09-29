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

/** The counts beside Now in the sidebar: urgent rows (overdue tasks and Todoist's Inbox) in a red circle, then every row in the Now section, as its tab counts them. */
export function Default() {
  return (
    <StoryCard>
      <StoryRow label="Both" hint="Forty rows in Now, four of them urgent.">
        <Row urgent={4} now={40} />
      </StoryRow>
      <StoryRow label="Nothing urgent" hint="Only the Now count shows.">
        <Row urgent={0} now={12} />
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
