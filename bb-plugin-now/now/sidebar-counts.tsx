/**
 * The counts beside the page's name in the sidebar: the overdue rows in a red
 * circle, what to deal with today in a blue one, then every row in Now, which
 * includes them. Each is left out at zero.
 */
export function SidebarCounts({ overdue, today, now }: { overdue: number; today: number; now: number }) {
  if (now === 0) return null;
  const badge = "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white";
  return (
    <span className="flex items-center gap-1 text-xs tabular-nums">
      {overdue === 0 ? null : (
        <span title={`${overdue} overdue`} className={`${badge} bg-red-600`}>
          {overdue}
        </span>
      )}
      {today === 0 ? null : (
        <span title={`${today} to do today`} className={`${badge} bg-[#2a78d6] dark:bg-[#3987e5]`}>
          {today}
        </span>
      )}
      <span title={`${now} in Now`} className="ml-0.5 text-muted-foreground">
        {now}
      </span>
    </span>
  );
}
