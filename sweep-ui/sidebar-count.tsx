/**
 * The counts beside a sweep's name in bb's sidebar: the rows that need you
 * most in a red circle, as Now shows its urgent rows, then the total. The
 * circle is left out at zero, and both are at a total of zero.
 *
 * bb centers a lone count in a box at least 20px wide, so the total keeps
 * that box and lines up with the counts on other rows when the circle is
 * beside it.
 */
export function SidebarCount({
  urgent,
  total,
  urgentLabel,
  totalLabel,
}: {
  urgent: number;
  total: number;
  /** The circle's tooltip, such as "2 need you". */
  urgentLabel: string;
  /** The total's tooltip, such as "5 to review". */
  totalLabel: string;
}) {
  if (total === 0) return null;
  return (
    <span className="flex items-center justify-end gap-0.5 text-xs tabular-nums">
      {urgent === 0 ? null : (
        <span
          title={urgentLabel}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white"
        >
          {urgent}
        </span>
      )}
      <span title={totalLabel} className="inline-block min-w-5 text-center text-muted-foreground">
        {total}
      </span>
    </span>
  );
}
