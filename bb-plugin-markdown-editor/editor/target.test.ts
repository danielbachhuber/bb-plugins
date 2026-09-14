import { describe, expect, it } from "vitest";
import {
  TargetError,
  assertPathShape,
  buildFileTarget,
  isRooted,
  isSafeAbsolutePath,
  isSafeRelativePath,
} from "./target";

describe("isRooted", () => {
  it("treats workspace and thread storage as rooted", () => {
    expect(isRooted("workspace")).toBe(true);
    expect(isRooted("thread-storage")).toBe(true);
    expect(isRooted("host")).toBe(false);
  });
});

describe("isSafeRelativePath", () => {
  it("accepts ordinary nested paths", () => {
    expect(isSafeRelativePath("README.md")).toBe(true);
    expect(isSafeRelativePath("docs/specs/2026-01-01-design.md")).toBe(true);
    expect(isSafeRelativePath(".github/PULL_REQUEST_TEMPLATE.md")).toBe(true);
  });

  it("rejects escapes, absolutes, and empties", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath("/etc/hosts")).toBe(false);
    expect(isSafeRelativePath("../secrets.md")).toBe(false);
    expect(isSafeRelativePath("docs/../../secrets.md")).toBe(false);
    expect(isSafeRelativePath("./docs/notes.md")).toBe(false);
    expect(isSafeRelativePath("docs\\notes.md")).toBe(false);
  });

  it("allows a space in a filename, which is legal and common", () => {
    expect(isSafeRelativePath("docs/meeting notes.md")).toBe(true);
  });

  it("does not mistake a dotted filename for a traversal", () => {
    expect(isSafeRelativePath("docs/..notes.md")).toBe(true);
    expect(isSafeRelativePath("docs/release..notes.md")).toBe(true);
  });
});

describe("isSafeAbsolutePath", () => {
  it("requires a leading slash and no traversal", () => {
    expect(isSafeAbsolutePath("/Users/hubber/notes/plan.md")).toBe(true);
    expect(isSafeAbsolutePath("notes/plan.md")).toBe(false);
    expect(isSafeAbsolutePath("/Users/hubber/../root/.ssh/id_ed25519")).toBe(false);
  });
});

describe("buildFileTarget", () => {
  it("joins a workspace file to its environment root and host", () => {
    expect(
      buildFileTarget({
        kind: "workspace",
        path: "docs/plan.md",
        root: { hostId: "host_1", rootPath: "/Users/hubber/work/acme-widgets" },
      }),
    ).toEqual({
      hostId: "host_1",
      rootPath: "/Users/hubber/work/acme-widgets",
      path: "/Users/hubber/work/acme-widgets/docs/plan.md",
    });
  });

  it("joins a thread-storage file to its storage root", () => {
    expect(
      buildFileTarget({
        kind: "thread-storage",
        path: "Attachments/notes.md",
        root: {
          hostId: "host_1",
          rootPath: "/Users/hubber/.bb/thread-storage/thr_1",
        },
      }),
    ).toEqual({
      hostId: "host_1",
      rootPath: "/Users/hubber/.bb/thread-storage/thr_1",
      path: "/Users/hubber/.bb/thread-storage/thr_1/Attachments/notes.md",
    });
  });

  it("passes an absolute host path through with its host", () => {
    expect(
      buildFileTarget({
        kind: "host",
        path: "/Users/hubber/drafts/plan.md",
        hostId: "host_2",
      }),
    ).toEqual({ hostId: "host_2", path: "/Users/hubber/drafts/plan.md" });
  });

  it("omits hostId for a host file with no explicit host, letting bb pick the primary", () => {
    expect(
      buildFileTarget({ kind: "host", path: "/Users/hubber/drafts/plan.md" }),
    ).toEqual({ path: "/Users/hubber/drafts/plan.md" });
  });

  it("prefers the source's own host over the resolved root's", () => {
    expect(
      buildFileTarget({
        kind: "host",
        path: "/srv/notes.md",
        hostId: "host_explicit",
        root: { hostId: "host_fallback", rootPath: null },
      }),
    ).toEqual({ hostId: "host_explicit", path: "/srv/notes.md" });
  });

  it("refuses a rooted path that climbs out of its root", () => {
    expect(() =>
      buildFileTarget({
        kind: "workspace",
        path: "../../.bb/auth.json",
        root: { hostId: "host_1", rootPath: "/Users/hubber/work/acme-widgets" },
      }),
    ).toThrow(TargetError);
  });

  it("refuses a rooted source whose root never resolved", () => {
    expect(() =>
      buildFileTarget({
        kind: "workspace",
        path: "docs/plan.md",
        root: { hostId: "host_1", rootPath: null },
      }),
    ).toThrow(/no workspace path/i);
    expect(() =>
      buildFileTarget({ kind: "thread-storage", path: "notes.md", root: null }),
    ).toThrow(/no storage directory/i);
  });

  it("refuses a host source given a relative path", () => {
    expect(() => buildFileTarget({ kind: "host", path: "drafts/plan.md" })).toThrow(
      TargetError,
    );
  });
});

describe("assertPathShape", () => {
  it("passes the shapes each kind expects", () => {
    expect(() => assertPathShape("workspace", "docs/plan.md")).not.toThrow();
    expect(() => assertPathShape("thread-storage", "notes.md")).not.toThrow();
    expect(() => assertPathShape("host", "/srv/notes.md")).not.toThrow();
  });

  it("rejects a traversal without needing a root, so the boundary can check first", () => {
    expect(() => assertPathShape("workspace", "../../.bb/auth.json")).toThrow(
      /not a path under the root/,
    );
    expect(() => assertPathShape("host", "relative.md")).toThrow(
      /not an absolute path/,
    );
  });

  // bb refuses a relative path with "Path must be absolute" even when a root
  // is supplied, and the host daemon treats the root purely as a containment
  // guard. Every rooted read failed in the live app until this was fixed, so
  // the assertion is here to keep it fixed.
  it("hands bb an absolute path and keeps the root as the guard", () => {
    const target = buildFileTarget({
      kind: "workspace",
      path: "docs/plan.md",
      root: { hostId: "host_1", rootPath: "/Users/hubber/work/acme-widgets" },
    });
    expect(target.path.startsWith("/")).toBe(true);
    expect(target.rootPath).toBe("/Users/hubber/work/acme-widgets");
  });

  it("does not double the slash when a root ends in one", () => {
    expect(
      buildFileTarget({
        kind: "workspace",
        path: "docs/plan.md",
        root: { hostId: "host_1", rootPath: "/Users/hubber/work/acme-widgets/" },
      }).path,
    ).toBe("/Users/hubber/work/acme-widgets/docs/plan.md");
  });
});
