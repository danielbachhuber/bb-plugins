import { triageView } from "./view/fixtures";
import type { StoredView } from "./view/store";
import { ViewPanel, type ViewPanelProps } from "./view/view-panel";

export default {
  title: "dynamic-ui/View",
};

const noop = () => {};

const fresh: StoredView = {
  id: 1,
  threadId: "thr_story01",
  key: "default",
  view: triageView,
  cwd: "/tmp",
  publishedAt: "2026-03-12T12:00:00Z",
  items: {},
};

const worked: StoredView = {
  ...fresh,
  items: {
    "issue-101": {
      state: "done",
      result: { label: "Close only", at: "2026-03-12T12:05:00Z", exitCode: 0, output: "✓ Closed issue acme/widgets#101 (Export widgets as CSV)" },
    },
    "issue-117": {
      state: "done",
      result: { label: "Fix in a new thread", at: "2026-03-12T12:06:00Z", threadId: "thr_fix0117" },
    },
    "issue-123": { state: "dismissed", result: null },
  },
};

const failed: StoredView = {
  ...fresh,
  items: {
    "issue-101": {
      state: "open",
      result: { label: "Close only", at: "2026-03-12T12:05:00Z", exitCode: 1, output: "GraphQL: Could not resolve to an issue with the number of 101." },
    },
  },
};

function Panel(props: Partial<ViewPanelProps>) {
  return (
    <div className="h-[900px] w-[520px] border-l border-border bg-background">
      <ViewPanel stored={fresh} busyItem={null} onRun={noop} onDismiss={noop} onGoToThread={noop} {...props} />
    </div>
  );
}

/** A freshly published view: sections, badges, and every kind of button. */
export function Published() {
  return <Panel expandedItems={["issue-101"]} />;
}

/** A command button asks before it runs, showing the command. */
export function ConfirmCommand() {
  return <Panel confirming="issue-101:1" />;
}

/** After the user acted: a command's output, an opened thread, a dismissed item. */
export function AfterActions() {
  return <Panel stored={worked} />;
}

/** A command that failed leaves the item open with the output on it. */
export function CommandFailed() {
  return <Panel stored={failed} />;
}

/** An action in flight. */
export function Working() {
  return <Panel busyItem="issue-117" />;
}
