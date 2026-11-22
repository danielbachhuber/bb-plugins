import { ChecksMenu, type CheckEntry } from "./checks-menu";

export default {
  title: "component-library/Checks menu",
};

const START = Date.UTC(2026, 0, 1, 12, 0, 0);
const at = (secs: number) => new Date(START + secs * 1000).toISOString();

/** A check that started `start` seconds into the run and, unless still running, took `secs`. */
const run = (name: string, outcome: CheckEntry["outcome"], start: number, secs?: number, workflow = "Test"): CheckEntry => ({
  name,
  workflow,
  outcome,
  url: `https://github.com/acme/widgets/actions/runs/1/job/${name}`,
  startedAt: at(start),
  ...(secs !== undefined ? { completedAt: at(start + secs) } : {}),
});

const checks: CheckEntry[] = [
  run("lint", "pass", 0, 138),
  run("typecheck", "pass", 0, 47),
  run("unit", "cancelled", 0, 64),
  run("integration", "cancelled", 0, 71),
  run("build", "fail", 0, 312),
  run("e2e", "pending", 178),
  run("widgets-storybook", "pass", 4, 92, "Stories"),
  { name: "deploy-preview", outcome: "skip" },
];

/** Where the story's clock stands, so the running check's time does not change between captures. */
const NOW = START + 356 * 1000;

/**
 * Open: every check on the head commit, failing first, then cancelled, running, passed, and skipped,
 * each with how long it took. The running check shows its time so far; the skipped one shows none.
 */
export const Open = () => (
  <div className="h-80 p-6 text-xs text-muted-foreground" data-screenshot-frame>
    <ChecksMenu checks={checks} label="1 fail, 1 running, 2 cancelled, 3 pass, 1 skip" defaultOpen now={NOW}>
      <span className="text-destructive-text">1/7 failing</span>
    </ChecksMenu>
  </div>
);
