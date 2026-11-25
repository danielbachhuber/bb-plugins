import { describe, expect, it } from "vitest";
import { rpcContract } from "./contract.js";

// A view saved before a publish rule was added must still reach the composer.
// Publish checks the rules; the RPCs that return saved views check only their
// shape, or one old view blanks every card above the composer.
describe("saved views in RPC output", () => {
  const savedInlineWithSummary = {
    id: 1,
    threadId: "thr_a",
    key: "reviewer",
    view: {
      title: "Reviewer",
      summary: "",
      layout: "inline",
      numbered: true,
      sections: [
        {
          title: "",
          items: [
            {
              id: "q",
              title: "Request a review from octocat?",
              summary: "Reviewed the last change to this file.",
              actions: [
                { type: "message", label: "Yes", text: "Yes" },
                { type: "message", label: "No", text: "No" },
              ],
            },
          ],
        },
      ],
    },
    cwd: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    hiddenAt: null,
    items: {},
  };

  it("accepts an inline view with a summary in composer_views", () => {
    const parsed = rpcContract.composer_views.output.safeParse({ views: [savedInlineWithSummary], refreshAt: null });
    expect(parsed.success).toBe(true);
  });

  it("accepts it in view_get and thread_views", () => {
    expect(rpcContract.view_get.output.safeParse(savedInlineWithSummary).success).toBe(true);
    expect(rpcContract.thread_views.output.safeParse({ views: [savedInlineWithSummary] }).success).toBe(true);
  });
});
