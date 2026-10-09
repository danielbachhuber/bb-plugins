// bb's calendar, drawn the same way here because a plugin cannot import it:
// `@bb/shared-ui` is private to the bb repository and the plugin SDK exports
// no calendar, so this keeps bb's class names against bb's own theme tokens.
// Chevrons are Hugeicons rather than lucide, which is what this package has,
// and the cell size reads as a Tailwind v4 variable rather than v3 brackets.
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "../lib/cn";

/** bb's ghost button at icon size, which is what the month arrows and days are. */
const GHOST =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-state-hover hover:text-foreground";

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("group/calendar bg-background p-3 [--cell-size:2rem] [[data-slot=popover-content]_&]:bg-transparent", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col gap-4 md:flex-row", defaults.months),
        month: cn("flex w-full flex-col gap-4", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1", defaults.nav),
        button_previous: cn(GHOST, "h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50", defaults.button_previous),
        button_next: cn(GHOST, "h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50", defaults.button_next),
        month_caption: cn("flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)", defaults.month_caption),
        caption_label: cn("select-none text-sm font-medium", defaults.caption_label),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn("flex-1 select-none rounded-md text-[0.8rem] font-normal text-muted-foreground", defaults.weekday),
        week: cn("mt-2 flex w-full", defaults.week),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md",
          defaults.day,
        ),
        range_start: cn("rounded-l-md bg-accent", defaults.range_start),
        range_middle: cn("rounded-none", defaults.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaults.range_end),
        today: cn("rounded-md bg-accent text-accent-foreground data-[selected=true]:rounded-none", defaults.today),
        outside: cn("text-muted-foreground aria-selected:text-muted-foreground", defaults.outside),
        disabled: cn("text-muted-foreground opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...rest }) => <div data-slot="calendar" ref={rootRef} className={cn(className)} {...rest} />,
        Chevron: ({ orientation }) => (
          <HugeiconsIcon icon={orientation === "left" ? ArrowLeft01Icon : ArrowRight01Icon} className="size-4" />
        ),
        DayButton: CalendarDayButton,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const defaults = getDefaultClassNames();

  return (
    <button
      type="button"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        GHOST,
        "flex aspect-square h-auto w-full min-w-(--cell-size) flex-col gap-1 font-normal leading-none",
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
        "data-[range-start=true]:rounded-md data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground",
        "data-[range-end=true]:rounded-md data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground",
        "data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground",
        defaults.day,
        className,
      )}
      {...props}
    />
  );
}
