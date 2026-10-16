// The bar under the headline: every changed file on the branch, sized by its
// lines, filling as its hunks are read, with bb's own file list as a check.
// While there is room each file is a segment of hunks with its name under it;
// past that the files group by directory, so the names stay readable.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { ReviewView } from "@/review/contract";
import { barGroups, linesOf, MIN_HUNK_PX, MIN_LABEL_PX, readShare, sectionFor } from "./bar";
import { crossCheckLabel, viewedLabel } from "./labels";

const fill = (share: number) => `linear-gradient(90deg, var(--success) ${share * 100}%, var(--muted) ${share * 100}%)`;

/**
 * The bar's width, read in a ResizeObserver so layout has finished. The bar
 * takes the row's free space, so its width never depends on what it draws.
 */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function BranchBar({ view, onChoose }: { view: ReviewView; onChoose: (sectionId: string) => void }) {
  const [ref, width] = useWidth(480);
  const { byDirectory, groups } = barGroups(view.files, width);
  const total = Math.max(1, groups.reduce((n, group) => n + group.lines, 0));
  /** About how wide a part of the bar draws, from its share of the lines. */
  const px = (lines: number) => (width * lines) / total;
  const check = view.crossCheck;
  const open = (file: (typeof view.files)[number]) => {
    const section = sectionFor(file);
    if (section) onChoose(section);
  };
  return (
    <div data-branch-bar className="flex flex-wrap items-start gap-x-3 gap-y-1">
      <div ref={ref} className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <div className="flex h-2.5 gap-1">
          {groups.map((group) => (
            <span key={group.title} className="flex h-full" style={{ flexGrow: group.lines, flexBasis: 2, minWidth: 2, gap: 1 }}>
              {group.files.map((file) =>
                byDirectory || px(linesOf(file)) / file.hunks.length < MIN_HUNK_PX ? (
                  // Too narrow for its hunks: one segment, filled by the share of its lines read.
                  <button
                    key={file.path}
                    type="button"
                    data-bar-file={file.path}
                    title={file.path}
                    onClick={() => open(file)}
                    className="h-full rounded-[1px]"
                    style={{ flexGrow: linesOf(file), flexBasis: 1, minWidth: 1, background: fill(readShare(file)) }}
                  />
                ) : (
                  file.hunks.map((hunk) => (
                    <button
                      key={`${file.path}#${hunk.index}`}
                      type="button"
                      data-bar-file={file.path}
                      title={`${file.path}, hunk ${hunk.index + 1}${hunk.read ? ", viewed" : ""}`}
                      onClick={() => onChoose(hunk.section)}
                      className="h-full rounded-[1px]"
                      style={{ flexGrow: hunk.lines, flexBasis: 1, background: hunk.read ? "var(--success)" : "var(--muted)" }}
                    />
                  ))
                ),
              )}
            </span>
          ))}
        </div>
        <div className="flex gap-1 text-[10px] text-muted-foreground">
          {groups.map((group) => (
            <span key={group.title} title={group.title} className="truncate" style={{ flexGrow: group.lines, flexBasis: 0, minWidth: 0 }}>
              {px(group.lines) >= MIN_LABEL_PX && (
                <>
                  {group.label}
                  {byDirectory && <span className="tabular-nums"> {group.files.length}</span>}
                </>
              )}
            </span>
          ))}
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2 text-xs">
        <span className="tabular-nums text-muted-foreground">{viewedLabel(view.coverage)}</span>
        {check && (
          <>
            <span className="text-muted-foreground">·</span>
            <span
              data-cross-check={check.status}
              title={check.status === "unavailable" ? (check.reason ?? undefined) : [...check.onlyBb, ...check.onlyHere].join("\n") || undefined}
              className="flex items-center gap-1"
              style={{ color: check.status === "agree" ? "var(--success)" : check.status === "differ" ? "var(--destructive-text)" : "var(--muted-foreground)" }}
            >
              <Icon name={check.status === "agree" ? "CircleCheck" : check.status === "differ" ? "AlertTriangle" : "CircleQuestion"} className="size-3.5" />
              {crossCheckLabel(check)}
            </span>
          </>
        )}
      </span>
    </div>
  );
}
