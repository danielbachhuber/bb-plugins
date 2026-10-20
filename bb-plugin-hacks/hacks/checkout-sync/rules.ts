// Pure logic: what a checkout's position against its upstream looks like on
// the sidebar, and what clicking it does.
//
// No DOM, no git, and no network, so every decision can be tested against
// plain objects.

/** A project's main checkout against the branch it tracks. */
export interface CheckoutStatus {
  branch: string;
  /** The upstream, such as `origin/main`. */
  upstream: string;
  /** Commits on the branch that the upstream does not have. */
  ahead: number;
  /** Commits on the upstream that the branch does not have. */
  behind: number;
  /** The last fetch or pull that failed, until one succeeds. */
  error: string | null;
}

/** A project in the status reply: its name, and its checkout's status. */
export interface ProjectCheckout {
  name: string;
  /**
   * Null when the project has no checkout on this machine, or the checkout
   * is detached or tracks nothing, so there is nothing to compare.
   */
  status: CheckoutStatus | null;
}

export type Tone = "synced" | "behind" | "ahead" | "diverged" | "error";

export interface Indicator {
  tone: Tone;
  label: string;
}

/** Parses `git rev-list --left-right --count HEAD...@{u}`: ahead, then behind. */
export function parseAheadBehind(output: string): { ahead: number; behind: number } | null {
  const match = /^(\d+)\s+(\d+)\s*$/.exec(output.trim());
  if (!match) return null;
  return { ahead: Number(match[1]), behind: Number(match[2]) };
}

const commits = (count: number) => (count === 1 ? "1 commit" : `${count} commits`);

/** The first line of a git error, without git's `fatal:`/`error:` prefix. */
export function summarizeError(message: string): string {
  const lines = message
    .split("\n")
    .map((line) => line.replace(/^(fatal|error|hint):\s*/i, "").trim())
    .filter((line) => line !== "" && !line.startsWith("Command failed:"));
  return lines[0] ?? "git failed";
}

export function indicatorFor(project: string, status: CheckoutStatus): Indicator {
  const { branch, upstream, ahead, behind, error } = status;
  if (error !== null) {
    return {
      tone: "error",
      label: `${project}: could not update ${branch} from ${upstream}: ${error}. Click to try again.`,
    };
  }
  if (ahead > 0 && behind > 0) {
    return {
      tone: "diverged",
      label: `${project}: ${branch} has diverged from ${upstream}, ${commits(behind)} behind and ${commits(ahead)} ahead. Click to fetch; pulling needs a merge or rebase.`,
    };
  }
  if (behind > 0) {
    return {
      tone: "behind",
      label: `${project}: ${branch} is ${commits(behind)} behind ${upstream}. Click to pull.`,
    };
  }
  if (ahead > 0) {
    return {
      tone: "ahead",
      label: `${project}: ${branch} is ${commits(ahead)} ahead of ${upstream}, not pushed. Click to fetch.`,
    };
  }
  return {
    tone: "synced",
    label: `${project}: ${branch} is up to date with ${upstream}. Click to fetch.`,
  };
}

/** Whether a click should fast-forward the checkout after fetching. */
export function canFastForward(status: CheckoutStatus): boolean {
  return status.behind > 0 && status.ahead === 0;
}
