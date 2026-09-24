// What the thread header shows when the band could not attach below it: the
// step count and current step in the header row, with the whole overview in
// a popover. Drawn from props alone, like the band.

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { collapsedLine, headerAriaLabel, isEmpty } from "@/overview/steps";
import type { Overview } from "@/overview/types";
import { OverviewBody, type OverviewHandlers } from "./overview-band";

export function HeaderFallback({
  overview,
  now,
  isCompactViewport,
  ...handlers
}: {
  overview: Overview;
  now: number;
  isCompactViewport: boolean;
} & OverviewHandlers) {
  const line = collapsedLine(overview);
  const label = isEmpty(overview) ? "Overview" : line.step || "Overview";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 max-w-[280px] cursor-pointer gap-1.5 px-2"
          aria-label={headerAriaLabel(overview)}
        >
          <Icon name="ListTodo" className="size-3.5 shrink-0" />
          {line.count !== "" ? <span className="tabular-nums">{line.count}</span> : null}
          {isCompactViewport ? null : (
            <span className="truncate text-muted-foreground">{label}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] p-4">
        <OverviewBody overview={overview} now={now} {...handlers} />
      </PopoverContent>
    </Popover>
  );
}
