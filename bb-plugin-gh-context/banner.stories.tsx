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
import { ContextBanner } from "./components/context-banner";
import { Icon } from "./components/ui/icon";
import type { ContextIssue, ContextPullRequest, ContextReviewer, ThreadContext } from "./context/contract";

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

// gh-context's own banner. Fixtures mirror bb's above, so the two can be
// read side by side.

const contextPullRequest: ContextPullRequest = {
  repo: "acme/widgets",
  number: 128,
  title: "Promote widgets into core",
  url: "https://github.com/acme/widgets/pull/128",
  state: "open",
  attention: "checks_pending",
  checks: { state: "pending", totalCount: 13, passedCount: 10, failedCount: 0, pendingCount: 3 },
  canMerge: true,
  myReview: null,
  reviewers: [],
};

const promptIssue: ContextIssue = {
  repo: "acme/widgets",
  number: 21,
  url: "https://github.com/acme/widgets/issues/21",
  title: "Make widget rotation configurable",
  state: "open",
  source: "prompt",
  viaPullRequest: null,
  assignedToMe: true,
};

const viaPrIssue: ContextIssue = {
  repo: "acme/widgets",
  number: 34,
  url: "https://github.com/acme/widgets/issues/34",
  title: "Tidy up the widget settings",
  state: "open",
  source: "via-pr",
  viaPullRequest: 128,
  assignedToMe: false,
};

const closedIssue: ContextIssue = {
  ...promptIssue,
  number: 43,
  url: "https://github.com/acme/widgets/issues/43",
  title: "Decide how gadget themes are managed",
  state: "closed",
};

const committed = { label: "Committed", files: 36, insertions: 447, deletions: 112 } as const;

function context(overrides: Partial<ThreadContext> = {}): ThreadContext {
  return {
    archived: false,
    hide: true,
    pullRequest: null,
    issues: [],
    changes: null,
    harvest: { available: true, running: null },
    ...overrides,
  };
}

/** A stand-in for Harvest's clock, which needs a live Harvest plugin to draw. */
function HarvestStandIn({ running = false }: { running?: boolean }) {
  return (
    <span
      className={
        running
          ? "inline-flex items-center gap-1 rounded px-1 text-xs tabular-nums text-success"
          : "inline-flex items-center gap-1 rounded px-1 text-xs text-muted-foreground"
      }
    >
      <Icon name="Clock" className="size-3.5" aria-hidden="true" />
      {running ? "0:42" : null}
    </span>
  );
}

function OurBanner({
  size,
  value,
  harvest = true,
  running = false,
}: {
  size: "desktop" | "mobile";
  value: ThreadContext | null;
  harvest?: boolean;
  running?: boolean;
}) {
  return (
    <PromptStage size={size}>
      <ContextBanner
        context={value}
        compact={size === "mobile"}
        harvestSlot={harvest ? <HarvestStandIn running={running} /> : undefined}
        onMerge={noop}
        onMarkReady={noop}
        onArchive={noop}
        onUnarchive={noop}
        onOpenChanges={noop}
      />
    </PromptStage>
  );
}

function Pair(props: { value: ThreadContext | null; harvest?: boolean; running?: boolean }) {
  return (
    <div className="flex w-full min-w-0 items-start gap-3 overflow-x-auto">
      <OurBanner size="desktop" {...props} />
      <OurBanner size="mobile" {...props} />
    </div>
  );
}

export function Comparison() {
  return (
    <StoryCard>
      <StoryRow label="bb's banner" hint="What bb draws for this thread today.">
        <div className="flex w-full min-w-0 items-start gap-3 overflow-x-auto">
          <BbBanner size="desktop" />
          <BbBanner size="mobile" />
        </div>
      </StoryRow>
      <StoryRow label="gh-context" hint="The same thread: its PR, the issue its prompt names, changes, Harvest, merge.">
        <Pair value={context({ pullRequest: contextPullRequest, issues: [promptIssue], changes: committed })} />
      </StoryRow>
    </StoryCard>
  );
}

export function States() {
  return (
    <StoryCard>
      <StoryRow label="loading" hint="The first load on a thread; a thread visited before shows its last context instead.">
        <Pair value={null} harvest={false} />
      </StoryRow>
      <StoryRow label="PR only" hint="No issue linked; Harvest not installed.">
        <Pair value={context({ pullRequest: contextPullRequest, changes: committed })} harvest={false} />
      </StoryRow>
      <StoryRow label="PR and a via-PR issue" hint="The PR's body says Part of #34; the tooltip says so.">
        <Pair value={context({ pullRequest: contextPullRequest, issues: [promptIssue, viaPrIssue], changes: committed })} />
      </StoryRow>
      <StoryRow label="issue only" hint="A thread working on an issue before it has a branch or PR.">
        <Pair value={context({ issues: [promptIssue] })} />
      </StoryRow>
      <StoryRow label="Harvest running here" hint="The clock ticks for this thread's item.">
        <Pair value={context({ issues: [promptIssue] })} running />
      </StoryRow>
      <StoryRow label="closed issue" hint="Muted, with the closed icon.">
        <Pair value={context({ issues: [closedIssue] })} />
      </StoryRow>
      <StoryRow label="issue without gh" hint="gh missing or signed out: the number alone.">
        <Pair value={context({ issues: [{ ...promptIssue, title: null, state: null }] })} />
      </StoryRow>
      <StoryRow label="draft PR" hint="Mark ready in place of merge.">
        <Pair
          value={context({
            pullRequest: { ...contextPullRequest, state: "draft", attention: "draft" },
            changes: committed,
          })}
        />
      </StoryRow>
      <StoryRow label="merged PR" hint="The work is done, so archiving the thread is the suggested action.">
        <Pair value={context({ pullRequest: { ...contextPullRequest, state: "merged", attention: "merged", checks: null } })} />
      </StoryRow>
      <StoryRow label="PR a sweep linked" hint="A review thread not on the PR's branch: no checks, no merge.">
        <Pair value={context({ pullRequest: { ...contextPullRequest, attention: "none", checks: null, canMerge: false } })} />
      </StoryRow>
      <StoryRow label="uncommitted changes" hint="Before the first commit.">
        <Pair value={context({ changes: { label: "Uncommitted", files: 3, insertions: 42, deletions: 7 } })} harvest={false} />
      </StoryRow>
      <StoryRow label="archived" hint="Replaces everything else, with Unarchive.">
        <Pair value={context({ archived: true })} />
      </StoryRow>
      <StoryRow label="nothing to show" hint="Renders nothing, not an empty card. bb's banner still hides.">
        <Pair value={context()} harvest={false} />
      </StoryRow>
    </StoryCard>
  );
}

/** A review thread's PR, as a sweep links it: not on the thread's branch. */
const reviewPullRequest = { ...contextPullRequest, attention: "none" as const, checks: null, canMerge: false };

export function ReviewStates() {
  return (
    <StoryCard>
      <StoryRow label="review requested" hint="Waiting on your first review, asked of you or a team you are on.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, myReview: "requested" } })} />
      </StoryRow>
      <StoryRow label="re-review requested" hint="You reviewed, and someone asked you to look again.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, myReview: "re-requested" } })} />
      </StoryRow>
      <StoryRow label="you approved" hint="Your review is in, so archiving the thread is the suggested action.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, myReview: "approved" } })} />
      </StoryRow>
      <StoryRow label="you requested changes" hint="Also done until you are asked again.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, myReview: "changes_requested" } })} />
      </StoryRow>
      <StoryRow label="you commented" hint="A comment-only review still answers the request.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, myReview: "commented" } })} />
      </StoryRow>
      <StoryRow label="review dismissed" hint="Someone dismissed your review; nobody has asked for another.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, myReview: "dismissed" } })} />
      </StoryRow>
      <StoryRow label="draft you were asked to review" hint="Both labels, draft first.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, state: "draft", attention: "draft", myReview: "requested" } })} />
      </StoryRow>
      <StoryRow label="merged after you approved" hint="Merged is the news, so the review label drops.">
        <Pair value={context({ pullRequest: { ...reviewPullRequest, state: "merged", attention: "merged", myReview: "approved" } })} />
      </StoryRow>
    </StoryCard>
  );
}

/** A lettered stand-in for a GitHub avatar, so the stories load no real account's picture. */
function avatar(letter: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="${color}"/><text x="10" y="14" font-family="sans-serif" font-size="11" font-weight="600" fill="white" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const octocat = { login: "octocat", team: false, avatarUrl: avatar("O", "#7c5cc4") };
const hubber = { login: "hubber", team: false, avatarUrl: avatar("H", "#d0703c") };
const coreTeam = { login: "acme/core", team: true, avatarUrl: avatar("A", "#3c8dd0") };

function withReviewers(reviewers: ContextReviewer[], fields: Partial<ContextPullRequest> = {}) {
  return context({
    pullRequest: { ...contextPullRequest, reviewers, ...fields },
    issues: [promptIssue],
    changes: committed,
  });
}

/**
 * The pull request's reviewers, right after it: each avatar carries a badge
 * for where that review stands. Hovering lists them in words.
 */
export function Reviewers() {
  return (
    <StoryCard>
      <StoryRow label="approved, commented, team pending" hint="A team still waiting on one of its members has a square avatar.">
        <Pair
          value={withReviewers([
            { ...octocat, state: "approved" },
            { ...hubber, state: "commented" },
            { ...coreTeam, state: "pending" },
          ])}
        />
      </StoryRow>
      <StoryRow label="changes requested" hint="Red for a reviewer who asked for changes.">
        <Pair
          value={withReviewers([
            { ...octocat, state: "approved" },
            { ...hubber, state: "changes_requested" },
          ])}
        />
      </StoryRow>
      <StoryRow label="dismissed" hint="A dismissed review, with nobody asked again.">
        <Pair value={withReviewers([{ ...hubber, state: "dismissed" }])} />
      </StoryRow>
      <StoryRow label="no reviewers" hint="An open pull request nobody has been asked to review.">
        <Pair value={withReviewers([])} />
      </StoryRow>
      <StoryRow label="avatar missing" hint="An account GitHub has no image for, such as a bot, shows its initial.">
        <Pair value={withReviewers([{ ...octocat, avatarUrl: "data:,", state: "approved" }])} />
      </StoryRow>
      <StoryRow label="merged with no reviews" hint="Nothing to show: nobody needs to be asked any more.">
        <Pair value={withReviewers([], { state: "merged", attention: "merged", checks: null })} />
      </StoryRow>
    </StoryCard>
  );
}
