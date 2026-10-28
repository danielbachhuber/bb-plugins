import { describe, expect, it } from "vitest";

import { batchPrompt, batchTitle, subthreadRequest } from "./thread-seed";

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
      title: "#412 Cache the widget index",
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

describe("batchTitle", () => {
  it("lists every number when they fit", () => {
    expect(batchTitle("pull", [412, 415])).toBe("Batch of 2 PRs: #412, #415");
    expect(batchTitle("issue", [88, 91, 102, 117, 130])).toBe("Batch of 5 issues: #88, #91, #102, #117, #130");
  });

  it("counts the numbers that do not fit", () => {
    const numbers = Array.from({ length: 30 }, (_, index) => 1200 + index);
    const title = batchTitle("pull", numbers);
    expect(title).toBe("Batch of 30 PRs: #1200, #1201, #1202 +27 more");
    expect(title.length).toBeLessThanOrEqual(48);
  });

  it("keeps the first number however long the numbers are", () => {
    expect(batchTitle("issue", [1234567890123, 1234567890124, 1234567890125])).toBe(
      "Batch of 3 issues: #1234567890123 +2 more",
    );
  });

  it("names one row in the singular", () => {
    expect(batchTitle("pull", [412])).toBe("Batch of 1 pull request: #412");
  });
});
