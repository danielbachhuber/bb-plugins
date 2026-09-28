import { codeReviewView, dependabotConflictView, grantView, groceryView, staplesView, triageView } from "./view/fixtures";
import { ChangesBlock } from "./view/changes-block";
import { ListPanel } from "./view/list-panel";
import type { View } from "./view/schema";
import { applyStatus, type StoredView } from "./view/store";
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
      <ViewPanel stored={fresh} busyItem={null} onRun={noop} onDismiss={noop} onGoToThread={noop} onStartThread={noop} onRunRelated={noop} onOpenItem={noop} {...props} />
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
const grocery: StoredView = { ...fresh, view: groceryView };

/** A one-line field beside five product buttons: type a product of your own and press Use this, or Enter. */
export function TextDraft() {
  return <Panel stored={grocery} focusItemId="apples" />;
}

/** A question card whose answer is the main button, with a product button in case one fits. */
export function TextDraftQuestion() {
  return <Panel stored={grocery} focusItemId="chew-toy" />;
}

/** After the answer is sent: the field shows it, greyed, and the banner repeats it. */
export function TextDraftSent() {
  return (
    <Panel
      stored={{
        ...grocery,
        items: { "chew-toy": { state: "done", result: { label: "Send answer", at: "2026-03-12T12:05:00Z", draft: "A rubber bone for a small dog" } } },
      }}
      focusItemId="chew-toy"
    />
  );
}

const grant: StoredView = { ...fresh, key: "grant", view: grantView, publishedAt: "2026-03-12T09:51:00Z", items: applyStatus(grantView, {}) };

/** A section worked in rounds: its status set by the agent beside its badges, and its history under the summary. Its buttons stay usable until the agent marks it complete. */
export function StatusRounds() {
  return <Panel stored={grant} focusItemId="need" />;
}

/** Revise pressed: the banner says it was sent, until the agent publishes the next round. */
export function StatusJustRevised() {
  return (
    <Panel
      stored={{ ...grant, items: applyStatus(grantView, { need: { state: "open", result: { label: "Revise", at: "2026-03-12T09:53:00Z", edited: true } } }) }}
      focusItemId="need"
    />
  );
}

const conflict: StoredView = { ...fresh, key: "dependabot", view: dependabotConflictView };

/** A pull request's files: package.json's diff in bb's own diff view, and the lockfile as the packages whose versions changed, the zod downgrade package.json doesn't explain flagged. */
export function ChangesFiles() {
  return <Panel stored={conflict} focusItemId="pr-418" />;
}

// The lockfile's own diff, after Show the raw diff.
function RawLockfile() {
  const item = dependabotConflictView.sections[0]!.items[0]!;
  return (
    <div className="h-[900px] w-[520px] border-l border-border bg-background px-4 py-4">
      <ChangesBlock item={item} draft={item.draft} initiallyRaw initiallyOpen={[1]} initialMode="split" />
    </div>
  );
}

/** The lockfile's raw diff, one click from its packages, here split side by side. */
export function ChangesRawLockfile() {
  return <RawLockfile />;
}

/** A code review finding: the hunk it is about, above the comment to post. */
export function ChangesCodeReview() {
  return <Panel stored={{ ...fresh, key: "review", view: codeReviewView }} focusItemId="finding-1" />;
}

/** A section's proposed text against the application: each line beside what it replaced, the changed words marked. */
export function ChangesProse() {
  return <Panel stored={grant} focusItemId="need" />;
}

/** The same change split side by side: before on the left, after on the right. */
export function ChangesProseSplit() {
  return <Panel stored={grant} focusItemId="need" changesMode="split" />;
}

/** Edit: the proposed text as source, in place of the diff. Accept and Revise send it as left here. */
export function ChangesProseEdit() {
  return <Panel stored={grant} focusItemId="need" changesMode="edit" />;
}

/** Work that fills pages: the map at the top sizes each section by its word limit and fills it by its count, Approach red for running over; under the section, notes from the release history to add, one already used. */
export function MapAndRelated() {
  return <Panel stored={grant} focusItemId="need" />;
}

/** Add pressed on a related note: it says so until the agent publishes again and marks the note used. */
export function RelatedJustAdded() {
  return (
    <Panel
      stored={{
        ...grant,
        items: applyStatus(grantView, { need: { state: "open", result: null, related: { "security-queue": { label: "Add", at: "2026-03-12T09:55:00Z" } } } }),
      }}
      focusItemId="need"
    />
  );
}
