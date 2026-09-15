// Relative timestamps, in bb's house phrasing ("4m ago").
//
// Pure and clock-free: the caller passes `now`, so the tests pin the wording
// rather than racing a real clock.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";

  const elapsed = now - then;
  // Small clock differences between writer and reader should read as "now",
  // not as a time in the future.
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;

  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
