/**
 * The raw `gh` issue shape, the staleness signals derived from it, and the
 * disposition a row carries once an agent has suggested one and the user has
 * ruled on it.
 */

/** One issue as `gh issue list --json` returns it. */
export interface RawIssue {
  number: number;
  title: string;
  url: string;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  author: { login: string } | null;
  assignees: { login: string }[];
  labels: { name: string }[];
  milestone: { title: string } | null;
  comments: unknown[];
  issueType?: { name: string } | null;
}

/**
 * What the agent proposes doing with an issue.
 *
 * `close` and `comment` both post `body`; only `close` also closes the issue.
 * `keep` and `needsInfo` never write to GitHub, so approving them only records
 * that the issue was looked at.
 */
export type SuggestedAction = 'close' | 'comment' | 'keep' | 'needsInfo';

export const SUGGESTED_ACTIONS: SuggestedAction[] = ['close', 'comment', 'keep', 'needsInfo'];

/** Whether an action writes to GitHub when approved. */
export function actionPostsComment(action: SuggestedAction): boolean {
  return action === 'close' || action === 'comment';
}

export function actionClosesIssue(action: SuggestedAction): boolean {
  return action === 'close';
}

export type Verdict = 'pending' | 'approved' | 'rejected';

/** The agent's proposal for one issue, written back through the CLI. */
export interface Suggestion {
  action: SuggestedAction;
  /** The comment to post. Empty for actions that do not post. */
  body: string;
  /** Why the agent proposed this, shown under the row. */
  rationale: string;
  suggestedAt: string;
  /** Thread that produced it, so a bad batch can be traced back. */
  threadId: string | null;
}

/** The user's ruling. `body` may differ from the suggestion's after an edit. */
export interface Disposition {
  verdict: Verdict;
  /** Required when rejected; the reason feeds the next pass. */
  rejectionReason: string;
  /** The edited comment body at the time of approval. */
  approvedBody: string;
  decidedAt: string | null;
  /** Set once the GitHub write succeeded. */
  appliedAt: string | null;
  applyError: string | null;
}

/**
 * The evidence the sweep derives without a model. Every field is a pure
 * function of a `RawIssue` plus the sweep's clock.
 */
export interface Staleness {
  ageDays: number;
  idleDays: number;
  emptyBody: boolean;
  commentCount: number;
  hasType: boolean;
  hasLabels: boolean;
  hasMilestone: boolean;
  assigned: boolean;
  /** Higher means staler. See `scoreStaleness`. */
  score: number;
}

export interface TriageRow {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  milestone: string | null;
  labels: string[];
  staleness: Staleness;
  suggestion: Suggestion | null;
  disposition: Disposition;
}

export const PENDING_DISPOSITION: Disposition = {
  verdict: 'pending',
  rejectionReason: '',
  approvedBody: '',
  decidedAt: null,
  appliedAt: null,
  applyError: null,
};
