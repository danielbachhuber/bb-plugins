import { ChecksMenu, type CheckEntry } from "./checks-menu";

export default {
  title: "component-library/Checks menu",
};

const run = (name: string, outcome: CheckEntry["outcome"], workflow = "Test"): CheckEntry => ({
  name,
  workflow,
  outcome,
  url: `https://github.com/acme/widgets/actions/runs/1/job/${name}`,
});

const checks: CheckEntry[] = [
  run("lint", "pass"),
  run("typecheck", "pass"),
  run("unit", "cancelled"),
  run("integration", "cancelled"),
  run("build", "fail"),
  run("e2e", "pending"),
  run("widgets-storybook", "pass", "Stories"),
  { name: "deploy-preview", outcome: "skip" },
];

/** Open: every check on the head commit, failing first, then cancelled, running, passed, and skipped. */
export const Open = () => (
  <div className="h-80 p-6 text-xs text-muted-foreground" data-screenshot-frame>
    <ChecksMenu checks={checks} label="1 fail, 1 running, 2 cancelled, 3 pass, 1 skip" defaultOpen>
      <span className="text-destructive-text">1/7 failing</span>
    </ChecksMenu>
  </div>
);
