import type { View } from "./schema.js";

/** A triage-shaped view: invented repository, issues, and people. */
export const triageView: View = {
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
          actions: [
            { type: "message", label: "Post and close", text: "Post the triage comment on #101 and close it as completed.", primary: true },
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
};
