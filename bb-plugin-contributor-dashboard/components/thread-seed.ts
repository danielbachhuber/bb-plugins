// The issue or pull request a row starts a thread about. The plugin has no
// opinion about environment or branch, so bb's composer keeps all of its
// pickers and the project's remembered defaults.

export interface ThreadSeed {
  kind: "issue" | "pull";
  number: number;
  title: string;
  url: string;
  /** What the list already says about it, repeated so the dialog stands alone. */
  meta: string;
}

/** What the thread starts with, which the user can rewrite before sending. */
export function promptFor(seed: ThreadSeed): string {
  const what = seed.kind === "issue" ? "issue" : "pull request";
  return `Work on ${what} #${seed.number}, "${seed.title}".\n\n${seed.url}\n`;
}

/** One row of a batch, as the main thread and its subthreads name it. */
export interface BatchRow {
  number: number;
  title: string;
  url: string;
}

const PLURAL = { issue: "issues", pull: "pull requests" } as const;
const SINGULAR = { issue: "issue", pull: "pull request" } as const;

/** bb's sidebar shows about this many characters of a title; its own generated titles stop at 48. */
const TITLE_WIDTH = 48;

const SHORT_PLURAL = { issue: "issues", pull: "PRs" } as const;

/**
 * The main thread's title: the kind and the numbers it covers, such as
 * "Batch of 3 PRs: #12, #34, #56". The verb is left out because the prompt
 * is the user's to write. A long batch lists as many numbers as fit and
 * counts the rest, such as "+27 more".
 */
export function batchTitle(kind: ThreadSeed["kind"], numbers: readonly number[]): string {
  const head = `Batch of ${numbers.length} ${numbers.length === 1 ? SINGULAR[kind] : SHORT_PLURAL[kind]}: `;
  const tags = numbers.map((number) => `#${number}`);
  for (let shown = tags.length; ; shown--) {
    const rest = tags.length - shown;
    const title = `${head}${tags.slice(0, shown).join(", ")}${rest === 0 ? "" : ` +${rest} more`}`;
    if (shown <= 1 || title.length <= TITLE_WIDTH) return title;
  }
}

/** What a batch's main thread starts with, which the user can rewrite before sending. */
export function batchPrompt(kind: ThreadSeed["kind"], rows: readonly BatchRow[]): string {
  const lines = rows.map((row) => `- #${row.number} ${row.title}\n  ${row.url}`);
  const these = rows.length === 1 ? `this ${SINGULAR[kind]}` : `these ${rows.length} ${PLURAL[kind]}`;
  return `Coordinate ${these}. Each has its own subthread under this one. Wait for them, then say what each found and what still needs a decision.\n\n${lines.join("\n")}\n`;
}

/** What one subthread starts with: its row's own Start thread prompt, and who it reports to. */
export function subthreadPrompt(kind: ThreadSeed["kind"], row: BatchRow, total: number): string {
  const own = promptFor({ kind, number: row.number, title: row.title, url: row.url, meta: "" });
  return `${own}\nThis is one of ${total} ${PLURAL[kind]} a main thread is coordinating. Report back to it when you are done.\n`;
}

/**
 * What one subthread is spawned with: the main thread's request from the
 * composer, so the provider, model, permission mode, and environment are the
 * ones the user chose, with only the prompt, title, and parent changed. The
 * composer's prompt and schedule belong to the main thread alone.
 */
export function subthreadRequest<R extends Record<string, unknown>>(
  composed: R,
  kind: ThreadSeed["kind"],
  row: BatchRow,
  total: number,
  parentThreadId: string,
): Omit<R, "input" | "prompt" | "sendAt"> & { prompt: string; title: string; parentThreadId: string } {
  const { input: _input, prompt: _prompt, sendAt: _sendAt, ...settings } = composed;
  return {
    ...(settings as Omit<R, "input" | "prompt" | "sendAt">),
    prompt: subthreadPrompt(kind, row, total),
    title: `#${row.number} ${row.title}`,
    parentThreadId,
  };
}
