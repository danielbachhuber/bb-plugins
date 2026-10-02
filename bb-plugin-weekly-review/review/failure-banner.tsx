/**
 * The banner across the top of the page when a source's latest gather failed.
 *
 * A failed source keeps showing what it gathered last time, so without this
 * the page reads as complete: an expired Harvest token looks like a week with
 * no hours. Display only, so a story can render it with fixture props.
 */
import { Icon } from "@/components/ui/icon";
import { clockTime } from "./clock.js";
import { toDay } from "./dates.js";

export interface FailingSource {
  name: string;
  error: string;
  /** When its data was last gathered successfully. Null when it never has been. */
  lastOkAt: string | null;
}

export function FailureBanner({
  failing,
  now = new Date(),
}: {
  failing: FailingSource[];
  now?: Date;
}) {
  if (failing.length === 0) return null;
  const heading = `${joinNames(failing.map((source) => source.name))} didn't gather`;

  return (
    <div
      role="alert"
      className="mb-4 flex gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2.5"
    >
      <Icon name="AlertCircle" className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm font-medium text-destructive">{heading}</div>
        {failing.map((source) => (
          <div key={source.name} className="text-sm">
            <div className="text-foreground">
              {source.lastOkAt === null
                ? `Nothing from ${source.name} this week yet.`
                : `${source.name} below is from ${whenAt(source.lastOkAt, now)}, its last good gather.`}
            </div>
            <div className="mt-0.5 break-words font-mono text-xs text-muted-foreground">
              {source.error}
            </div>
          </div>
        ))}
        <div className="text-xs text-muted-foreground">
          Fix the error, then Sync.
        </div>
      </div>
    </div>
  );
}

/** `1p` today, `Mon 7a` on another day. */
export function whenAt(instant: string, now: Date = new Date()): string {
  const date = new Date(instant);
  return toDay(date) === toDay(now)
    ? clockTime(instant)
    : `${date.toLocaleDateString("en-US", { weekday: "short" })} ${clockTime(instant)}`;
}

/** `Harvest`, `Harvest and GitHub`, `Harvest, GitHub, and Docs`. */
function joinNames(names: string[]): string {
  return names.length <= 2
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}
