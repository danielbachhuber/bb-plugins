// A thread's view above its composer and in its side panel. Each story is a
// whole thread: the conversation, the banner in bb's own card, bb's
// Uncommitted row, bb's real composer, and the side panel beside it. Clicking
// a row opens that item in the panel, as it does in bb. Invented data.
import { useState, type ReactNode } from "react";
import type { PermissionMode, PromptTextMention, WorkspaceStatus } from "@bb/domain";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { FollowUpPromptBox } from "@bb-app/components/promptbox/FollowUpPromptBox";
import { INERT_TYPEAHEAD_COMMAND_CONFIG } from "@bb-app/components/promptbox/PromptBoxInternal";
import { PromptStackCard } from "@bb-app/components/promptbox/banner/PromptStackCard";
import { ThreadPromptContextBanner } from "@bb-app/components/promptbox/banner/ThreadPromptContextBanner";
import { selectWorkspaceChangedFilesSection } from "@bb-app/components/workspace/workspace-change-summary";
import type { PickerOption } from "@bb-app/components/pickers/OptionPicker";
import { makeExecutionControlsProps, STORY_CLAUDE_CODE_MODELS, STORY_PROVIDER_OPTIONS } from "@bb-ladle/story-fixtures";
import { ViewBanner } from "./view/banner";
import { selfImproveView, triageView } from "./view/fixtures";
import type { View } from "./view/schema";
import type { ItemRecord, StoredView } from "./view/store";
import { ViewPanel } from "./view/view-panel";

export default {
  title: "dynamic-ui/Thread",
};

const noop = () => {};
// bb's own empty mention list. Bare @bb/* packages do not resolve from a
// plugin's stories, only the @bb-app and @bb-ladle aliases do.
const EMPTY_ORDERED_MENTION_SUGGESTIONS = { groups: [], suggestions: [] };

/* -------------------------------------------------------------------------- */
/* The thread around the banner                                               */
/* -------------------------------------------------------------------------- */

type Turn =
  | { kind: "user"; text: string }
  | { kind: "work"; text: string }
  | { kind: "assistant"; text: string };

function Conversation({ turns }: { turns: Turn[] }) {
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-6">
      {turns.map((turn, i) => {
        if (turn.kind === "user") {
          return (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground">
              {turn.text}
            </div>
          );
        }
        if (turn.kind === "work") {
          return (
            <div key={i} className="text-sm text-muted-foreground">
              {turn.text}
            </div>
          );
        }
        return (
          <div key={i} className="text-sm leading-relaxed text-foreground">
            <Markdown content={turn.text} />
          </div>
        );
      })}
    </div>
  );
}

const uncommitted: WorkspaceStatus = {
  workingTree: {
    state: "dirty",
    hasUncommittedChanges: true,
    files: [
      { path: "skills/triage/SKILL.md", status: "A", insertions: 118, deletions: 0 },
      { path: "skills/triage/findings.py", status: "A", insertions: 64, deletions: 0 },
    ],
    insertions: 182,
    deletions: 0,
    lineStatsComplete: true,
  },
  branch: { currentBranch: "main", defaultBranch: "main" },
  checkout: { kind: "branch", branchName: "main", headSha: null },
  mergeBase: null,
};
const uncommittedSection = selectWorkspaceChangedFilesSection(uncommitted);

function UncommittedRow() {
  if (!uncommittedSection) return null;
  return (
    <ThreadPromptContextBanner
      archivedSection={null}
      environmentGoneSection={null}
      gitSection={{ changedFiles: uncommittedSection, mergeBase: null, onPromptBannerFileClick: noop }}
      gitSectionPending={false}
      parentThreadSection={null}
      childThreadsSection={null}
      pullRequestSection={null}
      expandedSection={null}
      onToggleSection={noop}
    />
  );
}

const permissionOptions: readonly PickerOption<PermissionMode>[] = [
  { value: "accept-edits", label: "Accept Edits" },
  { value: "auto", label: "Approve for me" },
  { value: "full", label: "Full Access", tone: "warning" },
];

const baseExecution = makeExecutionControlsProps();
const execution = makeExecutionControlsProps({
  provider: { ...baseExecution.provider, options: STORY_PROVIDER_OPTIONS, selectedId: "claude-code" },
  model: { ...baseExecution.model, active: { model: "claude-sonnet-5" }, selected: "claude-sonnet-5", options: STORY_CLAUDE_CODE_MODELS },
});

function stored(view: View, items: Record<string, ItemRecord> = {}): StoredView {
  return { id: 1, threadId: "thr_story01", key: "default", view, cwd: "/tmp", publishedAt: "2026-03-12T12:00:00Z", items };
}

/**
 * A thread at a typical window width with its side panel open: the
 * conversation scrolls, the banner, the Uncommitted row, and the composer sit
 * at the bottom, and the panel shows whichever item was clicked.
 */
function ThreadStage({
  turns,
  view,
  initialFocus = null,
  initialCollapsed = false,
  confirming,
}: {
  turns: Turn[];
  view: StoredView;
  initialFocus?: string | null;
  initialCollapsed?: boolean;
  confirming?: string;
}) {
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<PromptTextMention[]>([]);
  const [focus, setFocus] = useState<string | null>(initialFocus);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  return (
    <div className="flex h-[860px] w-[1320px] overflow-hidden border border-border bg-background">
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto">
        <Conversation turns={turns} />
      </div>
      <div className="chat-prompt-box mx-auto w-full max-w-[760px] px-6 pb-4">
        <FollowUpPromptBox
          attachments={{ items: [], projectId: "proj_demo", isAttaching: false, error: null, onAttachFiles: noop, onRemove: noop }}
          stack={
            <>
              <PromptStackCard ariaLabel="dynamic-ui">
                <ViewBanner
                  stored={view}
                  collapsed={collapsed}
                  onToggle={() => setCollapsed((c) => !c)}
                  busyItem={null}
                  focusedItem={focus}
                  onOpenItem={(item) => setFocus(item.id)}
                  onRun={(item) => setFocus(item.id)}
                  onGoToThread={noop}
                />
              </PromptStackCard>
              <UncommittedRow />
            </>
          }
          composer={{
            history: { currentDraft: { text: draft, mentions, attachments: [] }, entries: [], onSelectEntry: noop },
            isFollowUpSubmitting: false,
            message: draft,
            mentionRanges: mentions,
            onChangeMessage: (text: string, next: PromptTextMention[]) => {
              setDraft(text);
              setMentions(next);
            },
            onModifierSubmit: noop,
            onSubmit: () => setDraft(""),
            compactPromptPlaceholder: "Ask for a follow-up",
            promptPlaceholder: "Ask for a follow-up. @ to mention files, folders, sections, or threads",
            canModifierSubmit: false,
            steerActiveThreadOnEnter: false,
            submitMode: { kind: "ready" },
            threadRuntimeDisplayStatus: "idle",
          }}
          environmentSummary={null}
          contextWindowUsage={null}
          execution={execution}
          permission={{ value: "full", options: permissionOptions, onChange: noop, supported: true }}
          promptActions={[]}
          typeahead={{
            mention: { results: EMPTY_ORDERED_MENTION_SUGGESTIONS, isLoading: false, isError: false, onQueryChange: noop },
            command: INERT_TYPEAHEAD_COMMAND_CONFIG,
          }}
          collapseResetKey="thr_story"
        />
      </div>
    </div>
    <aside className="w-[440px] shrink-0 border-l border-border">
      {(
        <ViewPanel
          stored={view}
          busyItem={null}
          focusItemId={focus}
          confirming={confirming}
          onRun={noop}
          onDismiss={noop}
          onGoToThread={noop}
        />
      )}
    </aside>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Triage                                                                     */
/* -------------------------------------------------------------------------- */

const triageTurns: Turn[] = [
  { kind: "user", text: "Triage milestone 4.2 in acme/widgets" },
  { kind: "work", text: "Read 3 issues, their timelines, and 4 linked pull requests" },
  {
    kind: "assistant",
    text: "Milestone 4.2 has **3 open issues**: one done and ready to close, one still needed, one duplicate. They're above the composer; click one to see its evidence and the drafted comment.",
  },
];

/** The view above the composer, before anything is opened. */
export function Triage() {
  return <ThreadStage turns={triageTurns} view={stored(triageView)} />;
}

/** A row clicked: the side panel shows that issue with its details and every button. */
export function TriageItemOpen() {
  return <ThreadStage turns={triageTurns} view={stored(triageView)} initialFocus="issue-101" />;
}

/** "Close only" is a command, so clicking it opens the item asking first. */
export function TriageConfirmCommand() {
  return <ThreadStage turns={triageTurns} view={stored(triageView)} initialFocus="issue-101" confirming="issue-101:2" />;
}

/** After acting: one closed, one opened as a thread, one dismissed. */
export function TriageAfter() {
  return (
    <ThreadStage
      turns={triageTurns}
      view={stored(triageView, {
        "issue-101": { state: "done", result: { label: "Post and close", at: "2026-03-12T12:05:00Z" } },
        "issue-117": { state: "done", result: { label: "Fix in a new thread", at: "2026-03-12T12:06:00Z", threadId: "thr_fix0117" } },
        "issue-123": { state: "dismissed", result: null },
      })}
      initialFocus="issue-117"
    />
  );
}

/** A command that failed: the row says so, and the panel shows the output. */
export function TriageFailed() {
  return (
    <ThreadStage
      turns={triageTurns}
      view={stored(triageView, {
        "issue-101": {
          state: "open",
          result: { label: "Close only", at: "2026-03-12T12:05:00Z", exitCode: 1, output: "GraphQL: Could not resolve to an issue with the number of 101." },
        },
      })}
      initialFocus="issue-101"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Self-improve                                                               */
/* -------------------------------------------------------------------------- */

const selfImproveTurns: Turn[] = [
  { kind: "user", text: "Review my threads from the past week and find what we could improve." },
  { kind: "work", text: "Collected 94 threads, ran 13 reviewers, merged 41 reports" },
  {
    kind: "assistant",
    text: "I found **5 changes** that would have saved you time, most important first. They're above the composer: open a thread for any you want fixed.",
  },
];

/** Five findings above the composer. */
export function SelfImprove() {
  return <ThreadStage turns={selfImproveTurns} view={stored(selfImproveView)} />;
}

/** A finding opened: the evidence and the task in the side panel. */
export function SelfImproveItemOpen() {
  return <ThreadStage turns={selfImproveTurns} view={stored(selfImproveView)} initialFocus="finding-1" />;
}

/** Collapsed to one line once two threads are open. */
export function SelfImproveCollapsed() {
  return (
    <ThreadStage
      turns={selfImproveTurns}
      initialCollapsed
      view={stored(selfImproveView, {
        "finding-1": { state: "done", result: { label: "Open thread", at: "t", threadId: "thr_imp0001" } },
        "finding-2": { state: "done", result: { label: "Open thread", at: "t", threadId: "thr_imp0002" } },
      })}
    />
  );
}
