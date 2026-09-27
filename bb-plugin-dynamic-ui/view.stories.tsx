import { staplesView, triageView } from "./view/fixtures";
import { ListPanel } from "./view/list-panel";
import type { View } from "./view/schema";
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
      <ViewPanel stored={fresh} busyItem={null} onRun={noop} onDismiss={noop} onGoToThread={noop} onStartThread={noop} {...props} />
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

function List(props: { stored: StoredView; busyItem?: string; confirming?: string }) {
  return (
    <div className="h-[520px] w-[520px] border-l border-border bg-background">
      <ListPanel busyItem={props.busyItem ?? null} onRun={noop} onDismiss={noop} {...props} />
    </div>
  );
}

const staples: StoredView = { ...fresh, key: "staples", view: staplesView };

/** A list view: the staples to add on top as dashed rows, each name editable before Add, with Skip; the list as it stands below. */
export function ListFresh() {
  return <List stored={staples} />;
}

/** Add running on one row. */
export function ListWorking() {
  return <List stored={staples} busyItem="bananas" />;
}

/** Added moves a row into the list as the name was sent, here edited to say how many, tagged with its button's done label; Skip strikes it through with Undo; a failure shows its error and keeps the buttons. */
export function ListAfter() {
  return (
    <List
      stored={{
        ...staples,
        items: {
          "oat-milk": {
            state: "done",
            result: { label: "Add", at: "2026-03-12T12:05:00Z", exitCode: 0, output: "Added: Oat milk (2 cartons)", edited: true, draft: "Oat milk (2 cartons)" },
          },
          bananas: { state: "dismissed", result: null },
          rice: { state: "open", result: { label: "Add", at: "2026-03-12T12:06:30Z", exitCode: 1, output: 'Error: no project named "Groceries"' } },
        },
      }}
    />
  );
}

// Coffee beans' Add made to ask first, as a command without `confirm: false` does.
const asking: View = {
  ...staplesView,
  sections: staplesView.sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.id === "coffee-beans" ? { ...item, actions: item.actions.map((action) => ({ ...action, confirm: true })) } : item,
    ),
  })),
} as View;

/** A command that asks first shows it under its row, with Run and Cancel. */
export function ListConfirm() {
  return <List stored={{ ...staples, view: asking }} confirming="coffee-beans:0" />;
}
