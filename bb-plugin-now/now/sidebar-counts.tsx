/**
 * The counts beside the page's name in the sidebar: the rows that need a
 * decision in a red circle, then the rest of Now. Each is left out at zero.
 */
export function SidebarCounts({ inbox, now }: { inbox: number; now: number }) {
  if (inbox === 0 && now === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums">
      {inbox === 0 ? null : (
        <span
          title={`${inbox} in the inbox`}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {inbox}
        </span>
      )}
      {now === 0 ? null : (
        <span title={`${now} more in Now`} className="text-muted-foreground">
          {now}
        </span>
      )}
    </span>
  );
}
