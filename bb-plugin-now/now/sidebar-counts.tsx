/**
 * The counts beside the page's name in the sidebar: the rows that need a
 * decision or are overdue in a red circle, then every row in Now, which includes them. Each is left out at zero.
 */
export function SidebarCounts({ urgent, now }: { urgent: number; now: number }) {
  if (urgent === 0 && now === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums">
      {urgent === 0 ? null : (
        <span
          title={`${urgent} to sort or overdue`}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {urgent}
        </span>
      )}
      {now === 0 ? null : (
        <span title={`${now} in Now`} className="text-muted-foreground">
          {now}
        </span>
      )}
    </span>
  );
}
