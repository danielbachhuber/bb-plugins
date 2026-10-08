import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SidebarCount } from "./sidebar-count";

export default {
  title: "component-library/Sidebar count",
};

// A sidebar row with bb's own spacing, so the counts sit where bb puts them.
function Row({ name, urgent, total }: { name: string; urgent: number; total: number }) {
  return (
    <div className="flex h-8 w-60 items-center justify-between rounded-md bg-sidebar px-2 text-sm text-sidebar-foreground">
      <span>{name}</span>
      <span className="flex h-5 w-16 items-center justify-end overflow-hidden">
        <SidebarCount
          urgent={urgent}
          total={total}
          urgentLabel={`${urgent} need you`}
          totalLabel={`${total} in the list`}
        />
      </span>
    </div>
  );
}

/** The counts beside a page's name in the sidebar: the rows that need you most in a red circle, then every row. */
export const States = () => (
  <StoryCard>
    <StoryRow label="Both" hint="Forty rows, four of them urgent.">
      <Row name="Now" urgent={4} total={40} />
    </StoryRow>
    <StoryRow label="Nothing urgent" hint="Only the total shows.">
      <Row name="Issues" urgent={0} total={12} />
    </StoryRow>
    <StoryRow label="Large" hint="Two-digit counts on both sides still fit.">
      <Row name="Reviews" urgent={38} total={99} />
    </StoryRow>
    <StoryRow label="Empty" hint="Nothing in the list, so nothing shows.">
      <Row name="Pull requests" urgent={0} total={0} />
    </StoryRow>
  </StoryCard>
);

/** Rows with and without a circle, one above the other: the totals line up because each keeps a box at least 20px wide. */
export const Aligned = () => (
  <div className="m-6 flex w-60 flex-col gap-0.5 rounded-md bg-sidebar p-1">
    <Row name="Now" urgent={4} total={40} />
    <Row name="Issues" urgent={0} total={7} />
    <Row name="Reviews" urgent={1} total={3} />
  </div>
);
