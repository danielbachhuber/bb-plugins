/**
 * Which GitHub issues a thread is about.
 *
 * Pure functions over prompt text and pull request data, so each rule can be
 * checked against the prompts it was drawn from. The rules came from reading
 * 76 threads whose prompts link an issue: the first prompt decides almost
 * every case, and an issue that only appears later in a thread is something
 * mentioned along the way rather than the thing being worked on.
 */

export interface IssueRef {
  /** `owner/name`, lowercased: GitHub matches repositories case-insensitively. */
  repo: string;
  number: number;
}

export interface WorkItem extends IssueRef {
  kind: "issue" | "pull";
}

/**
 * GitHub numbers issues and pull requests in one sequence per repository, so
 * a bare `#12` cannot say which it means; `/issues/12` can. The trailing
 * cases are real: a comment permalink ends in `#issuecomment-...`, a link
 * copied from a notification carries `?notification_referrer_id=`.
 */
const WORK_ITEM_URL =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/(issues|pull)\/(\d+)/g;

function toNumber(text: string): number | null {
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Every distinct issue or pull request the text links to, in order of appearance. */
export function workItems(text: string): WorkItem[] {
  const seen = new Set<string>();
  const found: WorkItem[] = [];
  for (const match of text.matchAll(WORK_ITEM_URL)) {
    const number = toNumber(match[3]!);
    if (number === null) continue;
    const item: WorkItem = {
      kind: match[2] === "pull" ? "pull" : "issue",
      repo: match[1]!.toLowerCase(),
      number,
    };
    const key = `${item.kind}:${item.repo}#${item.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(item);
  }
  return found;
}

/**
 * Rule 1: the first prompt links exactly one issue.
 *
 * Pull request links do not count against it. issue-sweep refused a prompt
 * naming one of each, because two sweeps each claimed and renamed the thread;
 * this rule links for display, which claims nothing, so "work on <issue> as a
 * stacked PR on top of <pull>" is plainly about the issue.
 */
export function promptIssue(text: string): IssueRef | null {
  const issues = workItems(text).filter((item) => item.kind === "issue");
  if (issues.length !== 1) return null;
  const [only] = issues;
  return { repo: only!.repo, number: only!.number };
}

/**
 * The pull request a first prompt is about: the prompt names exactly one
 * GitHub item, and it is a pull request.
 *
 * Stricter than rule 1 on purpose. "Work on <issue> as a stacked PR on top of
 * <pull>" names the pull request it builds on, not the one it will open, so a
 * prompt that also names an issue is not about the pull request. This is what
 * PR Sweep adopts a thread started by hand from.
 */
export function promptPullRequest(text: string): IssueRef | null {
  const items = workItems(text);
  if (items.length !== 1 || items[0]!.kind !== "pull") return null;
  return { repo: items[0]!.repo, number: items[0]!.number };
}

/**
 * Rule 2: the first line names `issue #N`.
 *
 * Handoff prompts open by saying which issue the thread takes on, then link
 * several issues further down, in instructions for the PR description. The
 * opening line is the one place that says which of them the work is. The
 * repository is not in the text; the caller supplies it from the thread's
 * checkout.
 */
export function openingLineIssueNumber(text: string): number | null {
  const firstLine = text.split("\n").find((line) => line.trim() !== "");
  if (!firstLine) return null;
  const match = firstLine.match(/\bissue\s+#(\d+)\b/i);
  return match ? toNumber(match[1]!) : null;
}

/** Keywords GitHub closes on, and the ones people use for "this is part of that". */
const REFERENCE_KEYWORD = String.raw`(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?|refs?|see|part of)`;
const BODY_REFERENCE = new RegExp(
  String.raw`\b${REFERENCE_KEYWORD}:?\s+(?:#(\d+)\b|https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\/issues\/(\d+))`,
  "gi",
);

/**
 * Rule 3: issues the thread's pull request closes or refers to.
 *
 * GitHub's own closing references come first; after them, issues the body
 * names after a keyword ("Part of #11", "See <url>"). A bare `#N` with no
 * keyword is not enough: bodies mention related work all the time.
 */
export function pullRequestIssueRefs(input: {
  repo: string;
  body: string;
  closing: readonly IssueRef[];
}): IssueRef[] {
  const repo = input.repo.toLowerCase();
  const found: IssueRef[] = [];
  const seen = new Set<string>();
  const add = (ref: IssueRef) => {
    const key = `${ref.repo}#${ref.number}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(ref);
  };

  for (const ref of input.closing) add({ repo: ref.repo.toLowerCase(), number: ref.number });
  for (const match of input.body.matchAll(BODY_REFERENCE)) {
    const number = toNumber(match[1] ?? match[3] ?? "");
    if (number === null) continue;
    add({ repo: match[2]?.toLowerCase() ?? repo, number });
  }
  return found;
}

/** `owner/name` from a GitHub remote URL, https or ssh; null for any other host. */
export function githubRepoFromRemote(url: string): string | null {
  const match = url
    .trim()
    .match(/^(?:https?:\/\/|ssh:\/\/git@|git@)(?:www\.)?github\.com[/:]([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+?)(?:\.git)?\/?$/);
  return match ? match[1]!.toLowerCase() : null;
}
