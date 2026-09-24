import { viewSchema, type View } from "./schema.js";

/** A triage-shaped view: invented repository, issues, and people. */
export const triageView: View = viewSchema.parse({
  title: "Triage: acme/widgets milestone 4.2",
  summary: "Three open issues. One is done and can close, one still needs work, one is a duplicate.",
  sections: [
    {
      title: "Ready to close",
      items: [
        {
          id: "issue-101",
          title: "#101 Export widgets as CSV",
          badges: [
            { label: "Done", tone: "success" },
            { label: "enhancement", tone: "neutral" },
          ],
          summary: "Shipped in acme/widgets#140, which added the **Export** menu and its tests.",
          details: "- Ask 1, CSV export: done in #140\n- Ask 2, include archived widgets: done in #140 (`--archived` flag)",
          draft: "This is done. #140 added **Export** to the widget list, and its `--archived` flag covers archived widgets.",
          draftLabel: "Comment to post",
          actions: [
            { type: "message", label: "Post and close", text: "Post this comment on #101, then close it as completed:\n\n{draft}", primary: true },
            { type: "message", label: "Post and keep open", text: "Post this comment on #101 and leave it open:\n\n{draft}", primary: false },
            { type: "command", label: "Close only", command: "gh issue close 101 --repo acme/widgets --reason completed", primary: false },
            { type: "link", label: "Open #101", url: "https://github.com/acme/widgets/issues/101", primary: false },
          ],
        },
      ],
    },
    {
      title: "Keep open",
      items: [
        {
          id: "issue-117",
          title: "#117 Gadget sync drops the last row",
          badges: [
            { label: "Still needed", tone: "warning" },
            { label: "bug", tone: "danger" },
          ],
          summary: "Still reproduces on main: `syncGadgets` stops one row early when the page size divides the total.",
          details: "",
          actions: [
            {
              type: "thread",
              label: "Fix in a new thread",
              project: "widgets",
              title: "Fix #117: gadget sync drops the last row",
              prompt: "Fix acme/widgets#117.",
              primary: true,
            },
          ],
        },
        {
          id: "issue-123",
          title: "#123 Dark mode for the dashboard",
          badges: [{ label: "Duplicate of #98", tone: "info" }],
          summary: "",
          details: "",
          actions: [],
        },
      ],
    },
  ],
});

/** A self-improve-shaped view: invented threads, projects, and findings. */
export const selfImproveView: View = viewSchema.parse({
  title: "Self-improve review",
  summary: "5 findings from 94 threads in the last 7 days, most important first.",
  sections: [
    {
      title: "Findings",
      items: [
        {
          id: "finding-1",
          title: "1. Link local files with absolute paths",
          badges: [
            { label: "correction overhead", tone: "warning" },
            { label: "18 threads", tone: "neutral" },
          ],
          summary:
            "A \"where is it?\" turn in most threads that wrote a draft.\n\n> Give me the full path to the PR description\n>\n> You, `Refine #412: move the export job`",
          details: "**Target:** global agent instructions\n\n**Found in:** `thr_aaa0001`, `thr_aaa0002`",
          draft:
            "In the global agent instructions, extend the drafting rule: whenever you point at a local file, write a Markdown link whose target is the absolute path, never `~/`.\n\nDone when the rule is in the file and nothing else in it contradicts it.",
          draftLabel: "Task for the new thread",
          actions: [
            { type: "thread", label: "Open thread", project: "widgets", title: "Improve: Link local files with absolute paths", prompt: "{draft}\n\nFound in: @thread:thr_aaa0001 @thread:thr_aaa0002", primary: true },
            { type: "message", label: "Discuss", text: "Before we fix finding 1, talk me through the evidence.", primary: false },
          ],
        },
        {
          id: "finding-2",
          title: "2. Delegate repository surveys to subagents",
          badges: [
            { label: "tokens", tone: "warning" },
            { label: "11 threads", tone: "neutral" },
          ],
          summary: "214M tokens in threads that never used a subagent.",
          details: "**Target:** global agent instructions",
          actions: [
            { type: "thread", label: "Open thread", project: "widgets", title: "Improve: Delegate repository surveys", prompt: "…", primary: true },
          ],
        },
        {
          id: "finding-3",
          title: "3. Stop nesting worktrees inside bb worktrees",
          badges: [
            { label: "breakage", tone: "danger" },
            { label: "4 threads", tone: "neutral" },
          ],
          summary: "Uncommitted work lost twice.",
          details: "**Target:** the resolve-merge-conflicts skill",
          actions: [
            { type: "thread", label: "Open thread", project: "gadgets", title: "Improve: Stop nesting worktrees", prompt: "…", primary: true },
          ],
        },
        {
          id: "finding-4",
          title: "4. One-click post, approve, merge for dependency bumps",
          badges: [
            { label: "non-chat UX", tone: "info" },
            { label: "19 threads", tone: "neutral" },
          ],
          summary: "The same three words typed once per bump.",
          details: "",
          actions: [
            { type: "thread", label: "Open thread", project: "widgets", title: "Improve: One-click dependency merges", prompt: "…", primary: true },
          ],
        },
        {
          id: "finding-5",
          title: "5. Say which suites the root test command skips",
          badges: [
            { label: "excess steps", tone: "info" },
            { label: "3 threads", tone: "neutral" },
          ],
          summary: "Rediscovered on every merge.",
          details: "",
          actions: [
            { type: "thread", label: "Open thread", project: "widgets", title: "Improve: Name the skipped suites", prompt: "…", primary: true },
          ],
        },
      ],
    },
  ],
});

/** A Dependabot-review-shaped view: one invented pull request, safe to merge. */
export const dependabotView: View = viewSchema.parse({
  title: "Dependabot #412: prettier",
  summary: "",
  sections: [
    {
      title: "",
      items: [
        {
          id: "pr-412",
          title: "#412 prettier 3.6.1 → 3.6.2",
          badges: [
            { label: "Safe to merge", tone: "success" },
            { label: "dev-only", tone: "neutral" },
            { label: "patch", tone: "neutral" },
          ],
          summary:
            "Safe to merge: dev-only patch bump, one formatter fix for a syntax we don't use, CI green.\n\n- **Changed:** a fix for decorators in class expressions\n- **Blast radius:** `npm run format` and the lint job only\n- **CI:** 12 of 12 passing",
          details: "The diff touches `package.json` and `package-lock.json` only.",
          draft:
            "Safe to merge. Prettier is a dev dependency here, used only by `npm run format` and the lint job.\n\n- 3.6.2 fixes formatting of decorators in class expressions, which acme/widgets doesn't use\n- No output changes on this repository: `npm run format -- --check` is clean on the branch\n- CI is green, 12 of 12",
          draftLabel: "Assessment to post",
          actions: [
            {
              type: "message",
              label: "Post, approve, and merge",
              text: "Post this assessment on #412, approve the PR, and turn on auto-merge (squash):\n\n{draft}",
              primary: true,
            },
            { type: "message", label: "Post only", text: "Post this assessment on #412 and stop there:\n\n{draft}" },
            { type: "link", label: "Open #412", url: "https://github.com/acme/widgets/pull/412" },
          ],
        },
      ],
    },
  ],
});

/** The same review for a conflicted runtime bump: the rebase is the likely next step. */
export const dependabotConflictView: View = viewSchema.parse({
  title: "Dependabot #418: date-fns",
  summary: "",
  sections: [
    {
      title: "",
      items: [
        {
          id: "pr-418",
          title: "#418 date-fns 4.1.0 → 4.2.0",
          badges: [
            { label: "Needs a look", tone: "warning" },
            { label: "runtime", tone: "neutral" },
            { label: "minor", tone: "neutral" },
          ],
          summary:
            "Needs a rebase first: the lockfile conflicts with main, and the diff shows an unrelated downgrade from the stale base.\n\n- **Changed:** new `formatISODuration` options, no breaking changes\n- **Blast radius:** 14 files import it, all through `lib/dates.ts`\n- **CI:** not run since the conflict",
          details: "The downgrade of `zod` in the diff comes from the stale base, not from this bump.",
          draft:
            "Safe once rebased. The bump adds options and changes nothing this repository calls.\n\n- Every import goes through `lib/dates.ts`, which uses `format` and `parseISO` only\n- The `zod` downgrade in the diff is a stale-base artifact",
          draftLabel: "Assessment to post",
          actions: [
            {
              type: "command",
              label: "Ask Dependabot to rebase",
              command: 'gh pr comment 418 --repo acme/widgets --body "@dependabot rebase"',
              primary: true,
            },
            { type: "message", label: "Post only", text: "Post this assessment on #418 and stop there:\n\n{draft}" },
            { type: "link", label: "Open #418", url: "https://github.com/acme/widgets/pull/418" },
          ],
        },
      ],
    },
  ],
});
