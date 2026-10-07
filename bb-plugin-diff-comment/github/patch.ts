// Whether a line can take a review comment on GitHub, and where.
//
// GitHub accepts a review comment only on a line inside the pull request's
// diff. bb's diff is often not that diff: it can include edits you have not
// pushed, or be the Uncommitted range. So the line number bb shows is not
// trusted. The comment's anchor, the line's text and its neighbours, is
// matched against the pull request's own patch for the file, with the same
// `locate` that keeps a local comment on its line. A match gives the line
// number GitHub knows; no match means the line is not on GitHub yet.
//
// Pure: the server fetches the patches and hands them here.
import { locate, type Anchored } from "@/comment/anchor";
import type { DiffLine } from "@/comment/types";
import { githubPath } from "./threads";

/** One file of the pull request, with its patch when GitHub sends one. */
export interface PullFile {
  path: string;
  /** Unified diff hunks. Absent for a binary file or a very large diff. */
  patch: string | null;
}

/**
 * Every line a patch shows, in two runs: the old side (context and
 * deletions), then the new side (context and additions). A context line is on
 * both, because bb's split view puts it in both columns, and a comment left
 * in the old column is on the old side. Keeping the runs apart keeps each
 * line's neighbours on its own side, which is what `locate` compares.
 */
export function patchLines(patch: string): DiffLine[] {
  const old: DiffLine[] = [];
  const next: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (header !== null) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }
    if (oldLine === 0 && newLine === 0) continue;
    const text = raw.slice(1);
    if (raw.startsWith("+")) {
      next.push({ side: "new", line: newLine++, text });
    } else if (raw.startsWith("-")) {
      old.push({ side: "old", line: oldLine++, text });
    } else if (raw.startsWith(" ")) {
      old.push({ side: "old", line: oldLine++, text });
      next.push({ side: "new", line: newLine++, text });
    }
    // "\ No newline at end of file" and blank trailing lines are not lines.
  }

  return [...old, ...next];
}

export type Target =
  | { ok: true; line: number }
  | { ok: false; reason: string };

/** Where on the pull request's diff a comment on this line would go. */
export function reviewTarget(
  files: PullFile[],
  path: string,
  anchored: Anchored,
): Target {
  const file = files.find((candidate) => candidate.path === githubPath(path));
  if (file === undefined) {
    return { ok: false, reason: "This file isn't in the pull request yet. Push it to comment on it." };
  }
  if (file.patch === null) {
    return { ok: false, reason: "GitHub doesn't show a diff for this file, so it can't take line comments." };
  }
  const line = locate(anchored, patchLines(file.patch));
  if (line === null) {
    return {
      ok: false,
      reason: "This line isn't in the pull request's diff yet. Push it to comment on it.",
    };
  }
  return { ok: true, line };
}

/** Names for the providers a thread can run on, for crediting an answer. */
const PROVIDER_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  pi: "Pi",
};

/**
 * The body posted for a local question and the agent's answer, so the
 * exchange reads on GitHub as one comment with the answer credited.
 */
export function exchangeBody(question: string, answer: string, providerId: string | null): string {
  const from = (providerId !== null && PROVIDER_NAMES[providerId]) || "the agent";
  return `${question.trim()}\n\n**Answer** (from ${from}):\n\n${answer.trim()}`;
}
