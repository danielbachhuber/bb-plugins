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
    title: `${row.title} (#${row.number})`,
    parentThreadId,
  };
}
