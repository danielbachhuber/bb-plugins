import { describe, expect, it } from "vitest";
import { buildMarkdownDocument } from "./document";

describe("buildMarkdownDocument", () => {
  it("names the workspace file for a thread's environment", () => {
    expect(
      buildMarkdownDocument(
        "docs/guides/index.md",
        { kind: "workspace", threadId: "thr_1", environmentId: "env_1" },
        "/work/widgets",
      ),
    ).toEqual({
      threadId: "thr_1",
      rootPath: "/work/widgets",
      target: { kind: "workspace", environmentId: "env_1", path: "docs/guides/index.md" },
    });
  });

  it("names the thread-storage file under the same thread", () => {
    expect(
      buildMarkdownDocument(
        "notes/plan.md",
        { kind: "thread-storage", threadId: "thr_1", environmentId: null },
        "/storage/thr_1",
      ),
    ).toEqual({
      threadId: "thr_1",
      rootPath: "/storage/thr_1",
      target: { kind: "thread-storage", threadId: "thr_1", path: "notes/plan.md" },
    });
  });

  it("falls back while the root is still loading or missing", () => {
    const source = { kind: "workspace", threadId: "thr_1", environmentId: "env_1" } as const;
    expect(buildMarkdownDocument("a.md", source, null)).toBeUndefined();
    expect(buildMarkdownDocument("a.md", source, "")).toBeUndefined();
  });

  it("falls back without a thread to route the open through", () => {
    expect(
      buildMarkdownDocument(
        "a.md",
        { kind: "workspace", threadId: null, environmentId: "env_1" },
        "/work/widgets",
      ),
    ).toBeUndefined();
  });

  it("falls back for a workspace file with no environment", () => {
    expect(
      buildMarkdownDocument(
        "a.md",
        { kind: "workspace", threadId: "thr_1", environmentId: null },
        "/work/widgets",
      ),
    ).toBeUndefined();
  });

  it("leaves host files to message routing", () => {
    expect(
      buildMarkdownDocument(
        "/tmp/a.md",
        { kind: "host", threadId: "thr_1", environmentId: null },
        "/",
      ),
    ).toBeUndefined();
  });
});
