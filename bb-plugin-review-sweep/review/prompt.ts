import { REVIEW_SKILL, ageInDays, sizeLabel } from "./actions.js";
import type { ClassifiedRow } from "./types.js";

/**
 * A prompt in the three pieces the panel needs it in.
 *
 * `header` identifies the pull request and is drawn as a preview card rather
 * than text you could edit — retyping it could only ever break the link between
 * the thread and the row. `body` is the panel's opinion about what to do, which
 * is the part worth steering, so it is what the composer opens with. `trailer`
 * is the standing procedure, which is the same every time and so is worth
 * neither the reading nor the screen space.
 *
 * All three reach the agent; only `body` reaches the composer.
 */
export interface PromptParts {
  header: string;
  body: string;
  trailer: string;
}

/** The three pieces as one prompt, with `body` overridable by what was typed. */
export function joinPromptParts(parts: PromptParts, body = parts.body): string {
  return [parts.header, "", body, "", parts.trailer].join("\n");
}

/**
 * The two ends as prompt items, ready to sit either side of what the composer
 * returned.
 *
 * The blank lines are carried here because bb concatenates a message's text
 * items with no separator at all: without them the URL that ends the header
 * runs into the first word typed, and the last word typed runs into the
 * trailer. They cannot live in `header`/`trailer` themselves, which are also
 * joined by {@link joinPromptParts} and would double up.
 */
export function headerItem(parts: PromptParts): string {
  return `${parts.header}\n\n`;
}

export function trailerItem(parts: PromptParts): string {
  return `\n\n${parts.trailer}`;
}

/** The facts a prompt names, which a stored row and a listed row both have. */
export type PromptRow = Pick<
  ClassifiedRow,
  "repo" | "number" | "title" | "url" | "author" | "state" | "requestedAt" | "size"
>;

/**
 * What the sweep found, stated as fact, then the one constraint that matters.
 *
 * The no-posting paragraph is not decoration. Reviewing someone else's pull
 * request is outward-facing in a way pushing to your own branch is not: a wrong
 * finding lands publicly on a colleague's PR and cannot be quietly undone. The
 * skill adds a finding to my pending review only when I choose that for it,
 * and a pending review is visible to no one else until it is submitted. The
 * prompt says so as well, because a direct user instruction outranks a skill's
 * own steps, and the skill can change.
 */
export function buildPromptParts(row: PromptRow, now: number): PromptParts {
  const waited = ageInDays(row.requestedAt, now);
  const context =
    row.state === "re-review"
      ? `You have reviewed it before; it came back to you ${waited === 0 ? "today" : `${waited} day(s) ago`}.`
      : `It has been waiting on you for ${waited === 0 ? "less than a day" : `${waited} day(s)`}.`;

  return {
    header: [
      `Review pull request ${row.repo}#${row.number}: "${row.title}", opened by ${row.author}.`,
      row.url,
    ].join("\n"),

    // What this review is and how it should read — the half worth steering.
    body: [
      `A review was requested of you. ${context} The diff is ${sizeLabel(row.size)}.`,
      "",
      `Use the \`${REVIEW_SKILL}\` skill.`,
      "",
      row.state === "re-review"
        ? "Because this is a re-review, say explicitly which of my earlier points were addressed and which were not, and confine new findings to what changed since my last review."
        : "Lead with whether you would approve it, then the findings worth my time. Skip nitpicks a linter would catch.",
    ].join("\n"),

    trailer: [
      // The one hard rule. Out of the composer but never out of the
      // prompt: it is the whole safety story for this action, and it is the
      // same sentence every time, which is what the trailer is for.
      //
      // The view is asked for here, not left to the impromptu-ui guide: the
      // skill offers a choice per finding, and a view is where those choices
      // become buttons instead of a list the user answers by typing.
      "Report your findings in this thread. When `bb impromptu-ui` is available, publish them as a view rather than writing them in chat: one card per finding, with the skill's choices for that finding as its buttons, laid out as the impromptu-ui skill's \"Code review findings\" section describes, with the verdict as the closing step. Add a finding to my pending review as a draft inline comment only when I choose that for it, and submit the review only when I choose a verdict. Do NOT post anything to GitHub beyond that (no submitted review, no comment, no approval) without asking me first and showing me exactly what you intend to post.",
      "",
      // A review thread opens in its own worktree by default, so checking the
      // pull request out there is safe and saves asking for it afterwards.
      // The composer can still put the thread in the project checkout, which
      // is mine and must stay on whatever branch I left it on.
      //
      // "Before you load the skill": the skill checks each suggested fix with
      // the pull request's head branch checked out, so the branch has to be
      // there before the review starts, not after.
      `If this thread runs in its own bb worktree, check the pull request out there yourself with \`gh pr checkout ${row.number}\` before you load the skill (add \`--detach\` if git says the branch is already checked out elsewhere). Leave it checked out when you finish. If it runs in the project checkout instead, leave that checkout's branch alone and read the diff with \`gh pr diff\` and \`gh pr view\`. \`bb status\` shows which one it is.`,
    ].join("\n"),
  };
}

/** The whole prompt, for anything that wants it in one piece. */
export function buildPrompt(row: PromptRow, now: number): string {
  return joinPromptParts(buildPromptParts(row, now));
}

/**
 * The skill offered as a chip when a review is started from a row, already
 * picked: the review skill, carrying the same "what to do" half that Batch
 * starts with.
 */
export function suggestedSkills(row: PromptRow, now: number): {
  name: string;
  reason: string;
  instruction: string;
  selected: boolean;
}[] {
  return [
    {
      name: REVIEW_SKILL,
      reason: row.state === "re-review" ? "It came back to you for another review" : "A review was requested of you",
      instruction: buildPromptParts(row, now).body,
      selected: true,
    },
  ];
}
