/**
 * The counts beside the page's name in the sidebar: the urgent rows (overdue
 * tasks and Todoist's Inbox) in a red circle, then every row in Now, which
 * includes them. The circle is left out
 * at zero, and both are at an empty Now.
 */
export function SidebarCounts({ urgent, now }: { urgent: number; now: number }) {
  if (now === 0) return null;
  return (
    <span className="flex items-center gap-1.5 text-xs tabular-nums">
      {urgent === 0 ? null : (
        <span
          title={`${urgent} urgent`}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {urgent}
        </span>
      )}
      <span title={`${now} in Now`} className="text-muted-foreground">
        {now}
      </span>
    </span>
  );
}
