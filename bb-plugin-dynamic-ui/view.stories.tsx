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
  hiddenAt: null,
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

/** Nothing picked yet: the panel starts on the first open entry. */
export function NothingPicked() {
  return <Panel />;
}

/** Every entry handled and none picked: the panel asks for one from the list above the composer. */
export function AllHandled() {
  return (
    <Panel
      stored={{
        ...fresh,
        items: {
          "issue-101": { state: "done", result: { label: "Post and close", at: "2026-03-12T12:05:00Z" } },
          "issue-117": { state: "done", result: { label: "Fix in a new thread", at: "2026-03-12T12:06:00Z", threadId: "thr_fix0117" } },
          "issue-123": { state: "dismissed", result: null },
        },
      }}
    />
  );
}

/** An entry picked: its summary, details, the draft to edit, and every button. */
export function Picked() {
  return <Panel focusItemId="issue-101" />;
}

/** The draft as source, after Raw is picked or its preview double-clicked. */
export function EditingDraft() {
  return <Panel focusItemId="issue-101" draftMode="raw" />;
}

/** A command button asks before it runs, showing the command. */
export function ConfirmCommand() {
  return <Panel focusItemId="issue-101" confirming="issue-101:2" />;
}

/** After a command ran: its output on the entry, and the draft as a preview only. */
export function AfterCommand() {
  return <Panel stored={worked} focusItemId="issue-101" />;
}

/** After opening a thread: the button becomes Go to thread. */
export function AfterThread() {
  return <Panel stored={worked} focusItemId="issue-117" />;
}

/** A command that failed leaves the entry open with the output on it. */
export function CommandFailed() {
  return <Panel stored={failed} focusItemId="issue-101" />;
}

/** An action in flight. */
export function Working() {
  return <Panel busyItem="issue-117" focusItemId="issue-117" />;
}
