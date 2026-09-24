// A skill's results shown right above the thread composer, in the slot
// `app.composer.customize({ banners })` gives a plugin. Each story is a whole
// thread: the conversation, the plugin's banner in bb's own card, bb's
// Uncommitted row, and bb's real composer. The banners can write into the
// composer, as a plugin can with `useComposer()`. Invented data throughout.
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
import { SelfImproveBanner } from "./composer/self-improve-banner";
import { TriageBanner } from "./composer/triage-banner";

export default {
  title: "dynamic-ui/Above the composer",
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

/**
 * A thread at a typical window width: the conversation scrolls, and the
 * banner, the Uncommitted row, and the composer sit at the bottom.
 */
function ThreadStage({
  turns,
  banner,
  initialDraft = "",
}: {
  turns: Turn[];
  banner: (setDraft: (text: string) => void) => ReactNode;
  initialDraft?: string;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [mentions, setMentions] = useState<PromptTextMention[]>([]);
  return (
    <div className="flex h-[860px] w-[900px] flex-col overflow-hidden border border-border bg-background">
      <div className="flex-1 overflow-y-auto">
        <Conversation turns={turns} />
      </div>
      <div className="chat-prompt-box mx-auto w-full max-w-[760px] px-6 pb-4">
        <FollowUpPromptBox
          attachments={{ items: [], projectId: "proj_demo", isAttaching: false, error: null, onAttachFiles: noop, onRemove: noop }}
          stack={
            <>
              <PromptStackCard ariaLabel="dynamic-ui">{banner((text) => { setDraft(text); setMentions([]); })}</PromptStackCard>
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
    text:
      "I read 94 threads from the past week and found **5 changes** that would have saved you time. They're above the composer, most important first.\n\n" +
      "The biggest is the same correction in 18 threads: you asked for the path to a draft because the link wasn't clickable. " +
      "The costliest in tokens: 9 of the 10 largest threads never used a subagent.\n\n" +
      "I ticked the three I'd fix first. Untick any you'd rather leave, or use **Discuss** on a row to ask me about it.",
  },
];

/** The review is back: findings above the composer, three picked. */
export function SelfImprove() {
  return <ThreadStage turns={selfImproveTurns} banner={(setDraft) => <SelfImproveBanner onDraft={setDraft} />} />;
}

/** One finding opened to show the evidence behind it. */
export function SelfImproveEvidence() {
  return (
    <ThreadStage turns={selfImproveTurns} banner={(setDraft) => <SelfImproveBanner onDraft={setDraft} initialExpanded="f2" />} />
  );
}

/** "Discuss" on a finding starts a message about it in the composer. */
export function SelfImproveDiscuss() {
  return (
    <ThreadStage
      turns={selfImproveTurns}
      initialDraft={'About "Delegate repository surveys to subagents": is 150k the right threshold?'}
      banner={(setDraft) => <SelfImproveBanner onDraft={setDraft} />}
    />
  );
}

/** Collapsed to one line, so the conversation has the room. */
export function SelfImproveCollapsed() {
  return <ThreadStage turns={selfImproveTurns} banner={(setDraft) => <SelfImproveBanner onDraft={setDraft} initialCollapsed />} />;
}

/** After opening three threads. */
export function SelfImproveOpened() {
  return (
    <ThreadStage
      turns={[
        ...selfImproveTurns,
        { kind: "work", text: "Opened 3 threads" },
        { kind: "assistant", text: "Opened a thread for each of the three. Two findings are left if you want them later." },
      ]}
      banner={(setDraft) => <SelfImproveBanner onDraft={setDraft} initialPicked={[]} opened={["f1", "f2", "f3"]} initialCollapsed />}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Triage                                                                     */
/* -------------------------------------------------------------------------- */

const triageTurns: Turn[] = [
  { kind: "user", text: "Triage milestone 4.2 in acme/widgets" },
  { kind: "work", text: "Read 6 issues, their timelines, and 9 linked pull requests" },
  {
    kind: "assistant",
    text:
      "Milestone 4.2 has **6 open issues**. Three are done and can close, two still need work, and one should move to 4.3 because nobody has picked it up.\n\n" +
      "I drafted a comment for each. They're above the composer one at a time: check what each issue asked for, change the outcome if you disagree, then post.",
  },
];

/** The first issue: what it asked for, the recommended outcome, and the drafted comment. */
export function Triage() {
  return <ThreadStage turns={triageTurns} banner={(setDraft) => <TriageBanner onDraft={setDraft} />} />;
}

/** An issue that's only partly done, three issues in. */
export function TriagePartlyDone() {
  return (
    <ThreadStage
      turns={triageTurns}
      banner={(setDraft) => (
        <TriageBanner onDraft={setDraft} start={3} initialDone={{ 101: "posted, close", 117: "posted, keep open", 123: "posted, close as not planned" }} />
      )}
    />
  );
}

/** "Edit comment" moves the draft into the composer; sending it posts with the chosen outcome. */
export function TriageEditInComposer() {
  return (
    <ThreadStage
      turns={triageTurns}
      initialDraft="Progress on this: #152 batched the inserts and added a progress bar. A 10k-row import now takes about 2 minutes, down from 9, so the one-minute target is still open."
      banner={(setDraft) => (
        <TriageBanner
          onDraft={setDraft}
          start={3}
          initialEditing
          initialDone={{ 101: "posted, close", 117: "posted, keep open", 123: "posted, close as not planned" }}
        />
      )}
    />
  );
}

/** Every issue handled. */
export function TriageDone() {
  return (
    <ThreadStage
      turns={[
        ...triageTurns,
        { kind: "work", text: "Posted 6 comments, closed 3 issues, moved 1" },
        { kind: "assistant", text: "Done. Two issues stay open in 4.2: #117 still reproduces, and #126 is faster but not yet under a minute." },
      ]}
      banner={(setDraft) => (
        <TriageBanner
          onDraft={setDraft}
          start={6}
          initialDone={{
            101: "posted, close",
            117: "posted, keep open",
            123: "posted, close as not planned",
            126: "posted, keep open",
            130: "posted, move to 4.3",
            134: "posted, close",
          }}
        />
      )}
    />
  );
}
