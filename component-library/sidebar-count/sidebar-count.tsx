const CIRCLE = "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none";
const RED = "bg-red-600 text-white";
const AMBER = "bg-amber-500 text-white";

function Circle({ count, label, className }: { count: number; label: string; className: string }) {
  return (
    <span title={label} className={`${CIRCLE} ${className}`}>
      {count}
    </span>
  );
}

const PILL = "inline-flex h-4 overflow-hidden rounded-full text-[10px] font-semibold leading-none text-white";
const HALF = "flex min-w-4 items-center justify-center px-1";

/**
 * The counts beside a page's name in bb's sidebar: the rows that need you
 * most in a red circle, then the total. A page that also counts the rows that
 * need you soon gets an amber circle for them, and when both counts are above
 * zero the two join into one pill, red then amber. Each circle is left out at
 * zero, and everything is at a total of zero.
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
  soon = 0,
  soonLabel = "",
}: {
  urgent: number;
  total: number;
  /** The red count's tooltip, such as "2 need you". */
  urgentLabel: string;
  /** The total's tooltip, such as "5 to review". */
  totalLabel: string;
  /** Rows that need you soon, such as those due today, counted apart from `urgent`. */
  soon?: number;
  /** The amber count's tooltip, such as "3 due today". */
  soonLabel?: string;
}) {
  if (total === 0) return null;
  return (
    <span className="flex items-center justify-end gap-0.5 text-xs tabular-nums">
      {urgent > 0 && soon > 0 ? (
        <span className={PILL}>
          <span title={urgentLabel} className={`${HALF} bg-red-600`}>
            {urgent}
          </span>
          <span title={soonLabel} className={`${HALF} bg-amber-500`}>
            {soon}
          </span>
        </span>
      ) : urgent > 0 ? (
        <Circle count={urgent} label={urgentLabel} className={RED} />
      ) : soon > 0 ? (
        <Circle count={soon} label={soonLabel} className={AMBER} />
      ) : null}
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
