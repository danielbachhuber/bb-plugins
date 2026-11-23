// Grey blocks that hold a screen's place while its data loads, shaped like
// what replaces them so nothing jumps when it arrives. Display only.

/** A grey block standing in for content that has not loaded yet. */
export function Bone({ className }: { className: string }) {
  // A span, so it can stand in for text inside a heading.
  return <span aria-hidden className={`block animate-pulse rounded bg-muted motion-reduce:animate-none ${className}`} />;
}

/** Rows standing in for a table with a name, a bar, and a few numbers per row, such as a step table. */
export function BoneRows({ count, className = "" }: { count: number; className?: string }) {
  return (
    <div className={`mt-3 ${className}`}>
      <Bone className="h-3 w-full max-w-md" />
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-border py-3">
          <div className="w-56 shrink-0 space-y-1.5">
            <Bone className="h-3.5 w-40" />
            <Bone className="h-2.5 w-24" />
          </div>
          <Bone className="h-2 flex-1" />
          <Bone className="h-3 w-10" />
          <Bone className="h-3 w-10" />
          <Bone className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Rows standing in for a list of issues or pull requests, in the same card the list draws. */
export function BoneList({ count, className = "mt-2" }: { count: number; className?: string }) {
  // Varied title widths, so the rows read as a list rather than a grid.
  const widths = ["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-7/12"];
  return (
    <ul aria-hidden className={`divide-y divide-border rounded-lg border border-border bg-card ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Bone className="h-3 w-10 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Bone className={`h-3.5 ${widths[i % widths.length]}`} />
            <Bone className="h-2.5 w-32" />
          </div>
          <Bone className="size-5 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

/** Says to a screen reader that the screen is loading; the blocks themselves are hidden from it. */
export function LoadingNote({ what }: { what: string }) {
  return (
    <p role="status" className="sr-only">
      Loading {what}
    </p>
  );
}
