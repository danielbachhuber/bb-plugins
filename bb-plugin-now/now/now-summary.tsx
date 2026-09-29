// The Now section's runs, one square per row, above its rows. Pressing a run
// shows only its rows; pressing it again shows them all.
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { NOW_GROUPS, nowGroupOf, type NowGroupId } from "./sections.js";
import type { Item } from "./types.js";

// Red, yellow, green, and blue pass a colorblind-separation check in each
// mode. The grays are quiet on purpose: Archive and Minor ask nothing of you.
const COLORS: Record<NowGroupId, string> = {
  urgent: "bg-[#d03b3b] dark:bg-[#d03b3b]",
  today: "bg-[#eda100] dark:bg-[#c98500]",
  me: "bg-[#1baf7a] dark:bg-[#199e70]",
  requests: "bg-[#2a78d6] dark:bg-[#3987e5]",
  archive: "bg-[#b5b3ab] dark:bg-[#6b6a65]",
  minor: "bg-[#dcdad3] dark:bg-[#3f3e3b]",
};

const LARGEST = 12;
const SMALLEST = 4;

export interface NowSummaryProps {
  /** The Now section's rows, in its order. */
  items: readonly Item[];
  now: Date;
  /** The run the list is narrowed to, or null for all of them. */
  value: NowGroupId | null;
  onChange: (value: NowGroupId | null) => void;
}

/**
 * One line of runs. The squares start at 12px and shrink half a pixel at a
 * time, down to 4px, while the last run sits on a line of its own. Past that
 * each label keeps only its count, with the name on hover. Any change of
 * width starts over from the largest squares and full labels.
 */
export function NowSummary({ items, now, value, onChange }: NowSummaryProps) {
  const runs = NOW_GROUPS.map((group) => ({ ...group, items: items.filter((item) => nowGroupOf(item, now) === group.id) }))
    .filter((run) => run.items.length > 0);
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [fit, setFit] = useState({ size: LARGEST, short: false });
  const shape = runs.map((run) => run.items.length).join(",");

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [runs.length > 0]);
  useLayoutEffect(() => setFit({ size: LARGEST, short: false }), [width, shape]);
  useLayoutEffect(() => {
    const children = ref.current === null ? [] : (Array.from(ref.current.children) as HTMLElement[]);
    const wrapped = children.length > 1 && children.at(-1)!.offsetTop > children[0]!.offsetTop;
    if (!wrapped) return;
    if (fit.size > SMALLEST) setFit({ ...fit, size: fit.size - 0.5 });
    else if (!fit.short) setFit({ size: LARGEST, short: true });
  }, [fit, width, shape]);

  if (runs.length === 0) return null;
  const { size, short } = fit;
  const gap = size >= 8 ? 2 : 1;
  return (
    <div
      ref={ref}
      role="group"
      aria-label="Now, by run"
      className={cn("flex flex-wrap items-start", short ? "gap-0.5" : "gap-1")}
    >
      {runs.map((run) => {
        const name = `${run.items.length} ${run.label.toLowerCase()}`;
        return (
          <button
            key={run.id}
            type="button"
            aria-pressed={run.id === value}
            aria-label={name}
            title={short ? name : undefined}
            onClick={() => onChange(run.id === value ? null : run.id)}
            className={cn(
              "group space-y-1 rounded-md py-1 text-left hover:bg-muted/60",
              short ? "px-0.5" : "px-1.5",
              run.id === value && "bg-muted",
            )}
          >
            {/* A run not chosen fades while another one is. */}
            <span
              className={cn("flex transition-opacity", value !== null && run.id !== value && "opacity-30")}
              style={{ gap }}
            >
              {run.items.map((item) => (
                <span
                  key={item.id}
                  title={item.title}
                  className={cn("shrink-0", COLORS[run.id])}
                  style={{ width: size, height: size, borderRadius: size >= 10 ? 3 : 2 }}
                />
              ))}
            </span>
            <span
              className={cn(
                "block w-max whitespace-nowrap text-xs text-muted-foreground group-hover:text-foreground",
                run.id === value && "text-foreground",
              )}
            >
              <span className="font-medium tabular-nums text-foreground">{run.items.length}</span>
              {short ? null : ` ${run.label.toLowerCase()}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
