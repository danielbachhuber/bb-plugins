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

/**
 * Where a checkout's sync script can live, relative to its root, in the order
 * they are tried. The first one that exists runs after a click pulls.
 */
export const SYNC_SCRIPTS = [".bb/sync", "sync.sh", "scripts/sync.sh"] as const;

/** The last run of a checkout's sync script. */
export interface ScriptRun {
  /** The script, relative to the checkout, such as `sync.sh`. */
  script: string;
  state: "running" | "failed" | "succeeded";
  /** Null while running, or when the run stopped before it could record one. */
  exitCode: number | null;
  /** The absolute path of the run's output. */
  log: string;
}

/** A project in the status reply: its name, and its checkout's status. */
export interface ProjectCheckout {
  name: string;
  /**
   * Null when the project has no checkout on this machine, or the checkout
   * is detached or tracks nothing, so there is nothing to compare.
   */
  status: CheckoutStatus | null;
  /** The last run of its sync script, if it has one and it has run. */
  run?: ScriptRun | null;
}

export type Tone = "synced" | "behind" | "ahead" | "diverged" | "error" | "running";

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

export function indicatorFor(
  project: string,
  status: CheckoutStatus,
  run: ScriptRun | null = null,
): Indicator {
  const { branch, upstream, ahead, behind, error } = status;
  if (error !== null) {
    return {
      tone: "error",
      label: `${project}: could not update ${branch} from ${upstream}: ${error}. Click to try again.`,
    };
  }
  if (run?.state === "running") {
    return { tone: "running", label: `${project}: running ${run.script}. Output: ${run.log}` };
  }
  if (run?.state === "failed") {
    const how = run.exitCode === null ? "stopped before it finished" : `failed with exit code ${run.exitCode}`;
    return {
      tone: "error",
      label: `${project}: ${run.script} ${how}. Output: ${run.log}. Click to run it again.`,
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

/** The first sync script that exists in a checkout, relative to its root. */
export function findSyncScript(exists: (relative: string) => boolean): string | null {
  return SYNC_SCRIPTS.find((script) => exists(script)) ?? null;
}

/**
 * Whether a click runs the sync script: when its pull brought in new commits,
 * or to retry a run that failed. A click that changes nothing leaves it alone.
 */
export function shouldRunScript(moved: boolean, last: ScriptRun | null): boolean {
  if (last?.state === "running") return false;
  return moved || last?.state === "failed";
}

/** How long a run can be starting before its script has recorded its pid. */
export const STARTING_GRACE_MS = 10_000;

/**
 * Reads a run's state file. The wrapper writes `running <pid>` when the script
 * starts and `exit <code>` when it ends; the server writes `starting` just
 * before it spawns the wrapper. A run whose process is gone without an exit
 * code, such as one killed by a restart, counts as failed.
 */
export function parseRunState(
  text: string,
  ageMs: number,
  alive: (pid: number) => boolean,
): Pick<ScriptRun, "state" | "exitCode"> | null {
  const [word, value] = text.trim().split(/\s+/);
  if (word === "starting") {
    return ageMs < STARTING_GRACE_MS
      ? { state: "running", exitCode: null }
      : { state: "failed", exitCode: null };
  }
  if (word === "running" && value !== undefined && /^\d+$/.test(value)) {
    return alive(Number(value)) ? { state: "running", exitCode: null } : { state: "failed", exitCode: null };
  }
  if (word === "exit" && value !== undefined && /^\d+$/.test(value)) {
    const exitCode = Number(value);
    return { state: exitCode === 0 ? "succeeded" : "failed", exitCode };
  }
  return null;
}
