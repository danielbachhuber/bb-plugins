import { useState, type ReactNode } from "react";
import type {
  ThreadPullRequest,
  WorkspaceFileStatus,
  WorkspaceStatus,
} from "@bb/domain";
import {
  ThreadPromptContextBanner,
  type ThreadPromptContextBannerExpandedSection,
} from "@bb-app/components/promptbox/banner/ThreadPromptContextBanner";
import { selectWorkspaceChangedFilesSection } from "@bb-app/components/workspace/workspace-change-summary";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";

export default {
  title: "gh-context/Banner",
};

const noop = () => {};

/** 36 committed files, +447 −112, spread unevenly the way a real branch is. */
const committedFiles: WorkspaceFileStatus[] = Array.from({ length: 36 }, (_, index) => ({
  path: `src/widgets/widget-${index + 1}.tsx`,
  status: index % 9 === 0 ? "A" : "M",
  insertions: index === 0 ? 97 : 10,
  deletions: index === 0 ? 7 : 3,
}));

const committedStatus: WorkspaceStatus = {
  workingTree: {
    state: "clean",
    hasUncommittedChanges: false,
    files: [],
    insertions: 0,
    deletions: 0,
    lineStatsComplete: true,
  },
  branch: {
    currentBranch: "bb/promote-widgets-into-core",
    defaultBranch: "main",
  },
  checkout: {
    kind: "branch",
    branchName: "bb/promote-widgets-into-core",
    headSha: null,
  },
  mergeBase: {
    mergeBaseBranch: "main",
    baseRef: "abc123",
    aheadCount: 6,
    behindCount: 0,
    hasCommittedUnmergedChanges: true,
    commits: [],
    files: committedFiles,
    insertions: 447,
    deletions: 112,
    lineStatsComplete: true,
  },
};

const committedSection = selectWorkspaceChangedFilesSection(committedStatus);
if (!committedSection) throw new Error("the committed fixture should produce a section");

const pullRequest: ThreadPullRequest = {
  number: 128,
  title: "Promote widgets into core",
  state: "open",
  url: "https://github.com/acme/widgets/pull/128",
  baseRefName: "main",
  headRefName: "bb/promote-widgets-into-core",
  updatedAt: "2026-09-23T11:24:23Z",
  checks: {
    state: "pending",
    totalCount: 13,
    passedCount: 10,
    failedCount: 0,
    pendingCount: 3,
  },
  review: {
    state: "approved",
    reviewRequestCount: 0,
  },
  mergeability: {
    state: "mergeable",
    mergeStateStatus: "UNSTABLE",
    mergeable: "MERGEABLE",
  },
  attention: "checks_pending",
};

/** The prompt box's width at each breakpoint, as bb's own banner stories stage it. */
function PromptStage({ children, size }: { children: ReactNode; size: "desktop" | "mobile" }) {
  return (
    <div
      data-promptbox-shell=""
      className={size === "desktop" ? "min-w-0 flex-1" : "w-[20rem] shrink-0"}
    >
      {children}
    </div>
  );
}

/** bb's banner as a thread with an open PR shows it today. */
function BbBanner({ size }: { size: "desktop" | "mobile" }) {
  const [expandedSection, setExpandedSection] =
    useState<ThreadPromptContextBannerExpandedSection | null>(null);
  return (
    <PromptStage size={size}>
      <ThreadPromptContextBanner
        gitSection={{
          changedFiles: committedSection!,
          mergeBase: { branch: "main", options: ["main"], onChange: noop },
          onPromptBannerFileClick: noop,
        }}
        gitSectionPending={false}
        archivedSection={null}
        environmentGoneSection={null}
        parentThreadSection={null}
        childThreadsSection={null}
        pullRequestSection={{
          pullRequest,
          actions: { onMerge: noop, selectedMergeMethod: "squash" },
        }}
        expandedSection={expandedSection}
        onToggleSection={(next) =>
          setExpandedSection((previous) => (previous === next ? null : next))
        }
      />
    </PromptStage>
  );
}

export function Default() {
  return (
    <StoryCard>
      <StoryRow
        label="bb's banner"
        hint="What gh-context replaces: an open PR with checks pending, committed changes, and squash merge selected."
      >
        <div className="flex w-full min-w-0 items-start gap-3 overflow-x-auto">
          <BbBanner size="desktop" />
          <BbBanner size="mobile" />
        </div>
      </StoryRow>
    </StoryCard>
  );
}
