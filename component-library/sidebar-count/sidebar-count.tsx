const CIRCLE = "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none";
const RED = "bg-red-600 text-white";
// Dark text, since white on amber is too faint to read at this size.
const AMBER = "bg-amber-400 text-amber-950";

function Circle({ count, label, className }: { count: number; label: string; className: string }) {
  return (
    <span title={label} className={`${CIRCLE} ${className}`}>
      {count}
    </span>
  );
}

/**
 * The counts beside a page's name in bb's sidebar: the rows that need you
 * most in a red circle, then the total. The circle is left out at zero, and
 * both are at a total of zero.
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
      {urgent === 0 ? null : <Circle count={urgent} label={urgentLabel} className={RED} />}
      <span title={totalLabel} className="inline-block min-w-5 text-center text-muted-foreground">
        {total}
      </span>
    </span>
  );
}

/**
 * Two counts in circles beside a page's name, for a page that has no total
 * worth showing: rows past a warning in amber, then rows past an error in
 * red. Each circle is left out at zero, and nothing is drawn when both are.
 */
export function SidebarLevels({
  warning,
  error,
  warningLabel,
  errorLabel,
}: {
  warning: number;
  error: number;
  /** The amber circle's tooltip, such as "2 threads past the warning". */
  warningLabel: string;
  /** The red circle's tooltip, such as "1 thread past the limit". */
  errorLabel: string;
}) {
  if (warning === 0 && error === 0) return null;
  return (
    <span className="flex items-center justify-end gap-0.5 text-xs tabular-nums">
      {warning === 0 ? null : <Circle count={warning} label={warningLabel} className={AMBER} />}
      {error === 0 ? null : <Circle count={error} label={errorLabel} className={RED} />}
    </span>
  );
}
