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
