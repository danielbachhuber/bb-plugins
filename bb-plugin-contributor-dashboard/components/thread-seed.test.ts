import { describe, expect, it } from "vitest";

import { batchPrompt, subthreadRequest } from "./thread-seed";

const ROW = { number: 412, title: "Cache the widget index", url: "https://github.com/acme/widgets/pull/412" };

describe("subthreadRequest", () => {
  it("keeps the composer's provider, model, and environment, and drops its prompt", () => {
    const composed = {
      projectId: "proj_widgets",
      providerId: "claude-code",
      model: "opus",
      permissionMode: "default",
      environment: { type: "new-worktree" },
      input: [{ type: "text", text: "Coordinate these" }],
      sendAt: 123,
    };
    const request = subthreadRequest(composed, "pull", ROW, 3, "thr_main");
    expect(request).toMatchObject({
      projectId: "proj_widgets",
      providerId: "claude-code",
      model: "opus",
      permissionMode: "default",
      environment: { type: "new-worktree" },
      title: "Cache the widget index (#412)",
      parentThreadId: "thr_main",
    });
    expect(request).not.toHaveProperty("input");
    expect(request).not.toHaveProperty("sendAt");
    expect(request.prompt).toContain('Work on pull request #412, "Cache the widget index".');
    expect(request.prompt).toContain("one of 3 pull requests a main thread is coordinating");
  });
});

describe("batchPrompt", () => {
  it("lists every row with its link", () => {
    expect(batchPrompt("issue", [ROW])).toContain("Coordinate this issue.");
    expect(batchPrompt("pull", [ROW, ROW])).toContain(`- #412 Cache the widget index\n  ${ROW.url}`);
  });
});
