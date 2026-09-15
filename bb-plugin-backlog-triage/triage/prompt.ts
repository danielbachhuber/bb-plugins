/**
 * The prompt for a research batch.
 *
 * It routes rather than restates: the thread is told what to look at, what to
 * write back, and where the line is. Judging whether an issue is obsolete is
 * the thread's job precisely because the sweep cannot do it.
 */

import type { TriageRow } from './types.js';

export function describeRow(row: TriageRow): string {
  const s = row.staleness;
  const signals = [
    `${s.idleDays}d idle`,
    `${s.ageDays}d old`,
    s.emptyBody ? 'empty body' : 'has body',
    `${s.commentCount} comment${s.commentCount === 1 ? '' : 's'}`,
    s.hasType ? 'typed' : 'no type',
    s.hasMilestone ? `milestone ${row.milestone}` : 'no milestone',
    s.assigned ? 'assigned' : 'unassigned',
  ].join(', ');
  return `- #${row.number} ${row.title}\n  ${row.url}\n  @${row.author} | ${signals}`;
}

export function buildResearchPrompt(repo: string, rows: TriageRow[]): string {
  return [
    `Triage ${rows.length} stale issue${rows.length === 1 ? '' : 's'} in ${repo}.`,
    '',
    'These were selected by staleness, not by a model. Your job is to decide what',
    'should happen to each one, and to write the comment that would say so.',
    '',
    rows.map(describeRow).join('\n'),
    '',
    '## For each issue',
    '',
    '1. Read it: `gh issue view <n> --repo ' + repo + ' --comments`.',
    '2. Check the claim against the current codebase. An issue asking for a tool',
    '   the repo has since replaced is obsolete; an issue describing a bug is not',
    '   obsolete just because it is old. Cite the file or config that settles it.',
    '3. Pick an action, and for a close, the reason GitHub should record:',
    '   - `close --reason completed` when the thing asked for now exists, even',
    '     if it arrived by another route.',
    '   - `close --reason "not planned"` when it is work nobody chose to do:',
    '     obsolete, superseded, or overtaken. This is the default.',
    '   - `close --reason duplicate --duplicate-of <n>` when another issue',
    '     covers it. The reason is recorded on the issue, so it is worth',
    '     getting right.',
    '   - `comment` when it needs a question answered before anyone can act, or',
    '     when the author already parked it and should confirm.',
    '   - `keep` when it names real work that still stands. No comment is posted.',
    '   - `needsInfo` when it is a bug report you cannot verify without a repro.',
    '     This posts your question, so write it as one.',
    '4. Write it back:',
    '',
    '```sh',
    'bb backlog-triage suggest <number> \\',
    `  --repo ${repo} \\`,
    '  --action close --reason "not planned" \\',
    '  --rationale "Repo formats with Biome; no prettier config exists." \\',
    '  --body "Closing this as obsolete. ..."',
    '```',
    '',
    '## Rules',
    '',
    '- You are drafting, not deciding. Every suggestion is reviewed and approved',
    '  by hand before anything is posted. Nothing you do here writes to GitHub.',
    '- Never run `gh issue close`, `gh issue comment`, or `gh issue edit`.',
    '- Write the comment as the final text, addressed to the issue thread. No',
    '  preamble about being an agent.',
    '- A close comment states the reason and invites a reopen. Keep it short.',
    '- Quote the author verbatim when their own comment is the reason to close.',
    '- If the evidence is thin, say so in the rationale and prefer `keep` over a',
    '  confident close. A wrong keep costs nothing; a wrong close costs trust.',
    '- Report at the end which issues you suggested what for, and which you could',
    '  not settle.',
  ].join('\n');
}
