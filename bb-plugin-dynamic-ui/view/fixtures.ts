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
