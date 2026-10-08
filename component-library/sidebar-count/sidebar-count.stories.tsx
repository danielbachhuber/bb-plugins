import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { SidebarCount, SidebarLevels } from "./sidebar-count";

export default {
  title: "component-library/Sidebar count",
};

// A sidebar row with bb's own spacing, so the counts sit where bb puts them.
function Row({ name, urgent, soon = 0, total }: { name: string; urgent: number; soon?: number; total: number }) {
  return (
    <div className="flex h-8 w-60 items-center justify-between rounded-md bg-sidebar px-2 text-sm text-sidebar-foreground">
      <span>{name}</span>
      <span className="flex h-5 w-16 items-center justify-end overflow-hidden">
        <SidebarCount
          urgent={urgent}
          soon={soon}
          total={total}
          urgentLabel={`${urgent} need you`}
          soonLabel={`${soon} due today`}
          totalLabel={`${total} in the list`}
        />
      </span>
    </div>
  );
}

/** The counts beside a page's name in the sidebar: the rows that need you most in a red circle, those due today in an amber one when the page counts them, then every row. */
export const States = () => (
  <StoryCard>
    <StoryRow label="Both" hint="Forty rows, four of them urgent.">
      <Row name="Now" urgent={4} total={40} />
    </StoryRow>
    <StoryRow label="Due today" hint="Four urgent, three due today, forty in all.">
      <Row name="Now" urgent={4} soon={3} total={40} />
    </StoryRow>
    <StoryRow label="Due today, large" hint="Two-digit counts in both circles and the total still fit.">
      <Row name="Now" urgent={12} soon={15} total={88} />
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

function LevelsRow({ name, warning, error }: { name: string; warning: number; error: number }) {
  return (
    <div className="flex h-8 w-60 items-center justify-between rounded-md bg-sidebar px-2 text-sm text-sidebar-foreground">
      <span>{name}</span>
      <span className="flex h-5 w-16 items-center justify-end overflow-hidden">
        <SidebarLevels
          warning={warning}
          error={error}
          warningLabel={`${warning} past the warning`}
          errorLabel={`${error} past the limit`}
        />
      </span>
    </div>
  );
}

/** Counts of rows past a warning, in amber, and past an error, in red, for a page with no total to show. */
export const Levels = () => (
  <StoryCard>
    <StoryRow label="Both" hint="Three rows past the warning, one past the limit.">
      <LevelsRow name="Tokenomics" warning={3} error={1} />
    </StoryRow>
    <StoryRow label="Warnings only" hint="Only the amber circle shows.">
      <LevelsRow name="Tokenomics" warning={2} error={0} />
    </StoryRow>
    <StoryRow label="Errors only" hint="Only the red circle shows.">
      <LevelsRow name="Tokenomics" warning={0} error={1} />
    </StoryRow>
    <StoryRow label="None" hint="Nothing past either, so nothing shows.">
      <LevelsRow name="Tokenomics" warning={0} error={0} />
    </StoryRow>
  </StoryCard>
);
