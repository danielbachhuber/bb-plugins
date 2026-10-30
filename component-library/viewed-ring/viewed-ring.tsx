/**
 * The ring Diff Viewed Enhanced draws beside "17/28 viewed" in the changes
 * panel's toolbar: a circle that fills in bb's primary color as files are
 * viewed, and turns green when all of them are.
 */
const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The ring as SVG markup, for a plugin that writes into bb's DOM as a string.
 * It is 12px square (`h-3 w-3`) and hidden from screen readers, so put the
 * count in text beside it.
 */
export function viewedRingSvg(viewed: number, total: number): string {
  const fraction = total === 0 ? 0 : viewed / total;
  const complete = total > 0 && viewed === total;
  const dash = (fraction * CIRCUMFERENCE).toFixed(2);
  const color = complete ? "var(--success)" : "var(--primary)";
  return (
    '<svg viewBox="0 0 16 16" class="h-3 w-3 shrink-0 -rotate-90" aria-hidden="true">' +
    `<circle cx="8" cy="8" r="${RADIUS}" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-width="2"/>` +
    `<circle cx="8" cy="8" r="${RADIUS}" fill="none" stroke="${color}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-dasharray="${dash} ${CIRCUMFERENCE.toFixed(2)}"` +
    (fraction === 0 ? ' stroke-opacity="0"' : "") +
    "/></svg>"
  );
}

/** The same ring as a React element. */
export function ViewedRing({ viewed, total }: { viewed: number; total: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0"
      dangerouslySetInnerHTML={{ __html: viewedRingSvg(viewed, total) }}
    />
  );
}

/** The ring and "3/6 viewed", as the changes panel's toolbar shows them. */
export function ViewedProgress({ viewed, total }: { viewed: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" title={`${viewed} of ${total} ${total === 1 ? "file" : "files"} viewed`}>
      <ViewedRing viewed={viewed} total={total} />
      <span>
        <span className="text-foreground">{viewed}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground">{total}</span>
        <span className="text-muted-foreground"> viewed</span>
      </span>
    </span>
  );
}
