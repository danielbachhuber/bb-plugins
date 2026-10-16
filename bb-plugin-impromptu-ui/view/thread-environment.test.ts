import { describe, expect, it } from "vitest";
import { parseView } from "./schema.js";
import { fetchArgsFor, threadEnvironment } from "./thread-environment.js";

const fix = { type: "thread", label: "Fix in a PR against this PR", project: "widgets", title: "Fix #101", prompt: "Fix it." };
const viewWith = (action: Record<string, unknown>) =>
  JSON.stringify({ title: "Review", sections: [{ items: [{ id: "a", title: "A", actions: [action] }] }] });

describe("a thread button's environment", () => {
  it("takes a baseBranch, and refuses one that is not a ref name", () => {
    const action = parseView(viewWith({ ...fix, baseBranch: "origin/feature/login" })).sections[0]!.items[0]!.actions[0]!;
    expect(action).toMatchObject({ type: "thread", baseBranch: "origin/feature/login" });
    expect(() => parseView(viewWith({ ...fix, baseBranch: "--upload-pack=x" }))).toThrow(/baseBranch/);
    expect(() => parseView(viewWith({ ...fix, baseBranch: "origin/a b" }))).toThrow(/baseBranch/);
  });

  it("uses the project's default without a baseBranch, and the personal workspace for personal", () => {
    expect(threadEnvironment({ baseBranch: undefined, personal: false, hostId: "host_1", project: "widgets" })).toEqual({ type: "project-default" });
    expect(threadEnvironment({ baseBranch: undefined, personal: true, hostId: null, project: "personal" })).toEqual({
      type: "host",
      workspace: { type: "personal" },
    });
  });

  it("starts a new worktree from baseBranch, which bb records as its merge base", () => {
    expect(threadEnvironment({ baseBranch: "origin/feature", personal: false, hostId: "host_1", project: "widgets" })).toEqual({
      type: "host",
      hostId: "host_1",
      workspace: { type: "managed-worktree", baseBranch: { kind: "named", name: "origin/feature" } },
    });
  });

  it("refuses a baseBranch where there is no checkout to make a worktree in", () => {
    expect(() => threadEnvironment({ baseBranch: "origin/feature", personal: true, hostId: null, project: "personal" })).toThrow(/personal project/);
    expect(() => threadEnvironment({ baseBranch: "origin/feature", personal: false, hostId: null, project: "widgets" })).toThrow(/No checkout of widgets/);
  });

  it("fetches a remote's branch before the worktree is cut from it", () => {
    expect(fetchArgsFor("origin/feature/login", ["origin", "upstream"])).toEqual([
      "fetch",
      "origin",
      "+refs/heads/feature/login:refs/remotes/origin/feature/login",
    ]);
    expect(fetchArgsFor("upstream/main", ["origin", "upstream"])).toEqual(["fetch", "upstream", "+refs/heads/main:refs/remotes/upstream/main"]);
    // A local branch, or a remote this checkout does not have, is left alone.
    expect(fetchArgsFor("feature", ["origin"])).toBeNull();
    expect(fetchArgsFor("feature/login", ["origin"])).toBeNull();
    expect(fetchArgsFor("origin/", ["origin"])).toBeNull();
  });
});
