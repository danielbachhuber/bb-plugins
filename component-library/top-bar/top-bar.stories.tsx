import { StoryCard, StoryRow } from "@bb-ladle/story-card";
import { HugeiconsIcon } from "@hugeicons/react";
import Target02Icon from "@hugeicons/core-free-icons/Target02Icon";

import { TopBarCount } from "./top-bar";

export default {
  title: "component-library/Top bar",
};

// The left end of bb's top bar: the chip, then a stand-in for the page title it sits before.
function Bar({ urgent, soon = 0, total, active = false }: { urgent: number; soon?: number; total: number; active?: boolean }) {
  return (
    <div className="flex h-10 w-80 items-center gap-1.5 bg-background px-3">
      <TopBarCount
        icon={<HugeiconsIcon icon={Target02Icon} />}
        label="Open Now"
        onClick={() => {}}
        active={active}
        urgent={urgent}
        soon={soon}
        total={total}
        urgentLabel={`${urgent} urgent`}
        soonLabel={`${soon} due today`}
        totalLabel={`${total} in Now`}
      />
      <span className="truncate text-sm text-foreground">Fix the widget sync</span>
    </div>
  );
}

/** A page's counts at the top left of bb's top bar, before the page title: its icon, the urgent and due-today counts as in the sidebar, then the total. Clicking it opens the page, and it shows as current while that page is open. */
export const States = () => (
  <StoryCard>
    <StoryRow label="Urgent and due today" hint="Two urgent, three due today, nine in all.">
      <Bar urgent={2} soon={3} total={9} />
    </StoryRow>
    <StoryRow label="On its page" hint="Shaded as the current page while Now is open.">
      <Bar urgent={2} soon={3} total={9} active />
    </StoryRow>
    <StoryRow label="Large" hint="Two-digit counts still fit.">
      <Bar urgent={16} soon={11} total={36} />
    </StoryRow>
    <StoryRow label="Urgent only" hint="Nothing due today, so the red circle stands alone.">
      <Bar urgent={4} total={12} />
    </StoryRow>
    <StoryRow label="Nothing urgent" hint="Only the total shows beside the icon.">
      <Bar urgent={0} total={5} />
    </StoryRow>
    <StoryRow label="Empty" hint="Nothing in the list, so only the icon shows.">
      <Bar urgent={0} total={0} />
    </StoryRow>
  </StoryCard>
);
