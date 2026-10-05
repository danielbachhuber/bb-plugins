import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin, { VIEWED_CHANGED } from "./server";

/** A host with GitHub sync off, so marks are local as they always were. */
async function start() {
  const host = createFakePluginHost({
    pluginId: "diff-viewed",
    settings: { syncGithub: "off" },
  });
  await plugin(host.bb);
  return host;
}

const A = { threadId: "thr_a", path: "src/a.ts", fingerprint: "+8 -4" };

describe("viewed_set", () => {
  it("persists a mark and hands back the new record", async () => {
    const { harness } = await start();

    const set = await harness.behavior.callRpc("viewed_set", {
      ...A,
      viewed: true,
    });
    expect(set).toEqual({ record: { "src/a.ts": "+8 -4" }, github: null });

    const listed = await harness.behavior.callRpc("viewed_list", {
      threadId: "thr_a",
    });
    expect(listed).toEqual({ record: { "src/a.ts": "+8 -4" }, github: null });
  });

  it("clears a mark", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });

    const cleared = await harness.behavior.callRpc("viewed_set", {
      ...A,
      viewed: false,
    });
    expect(cleared).toEqual({ record: {}, github: null });
  });

  it("keeps marks in separate threads apart", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });

    const other = await harness.behavior.callRpc("viewed_list", {
      threadId: "thr_b",
    });
    expect(other).toEqual({ record: {}, github: null });
  });

  it("publishes so another window can refetch", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });

    expect(harness.inspection.realtimeSignals).toEqual([
      { channel: VIEWED_CHANGED, payload: { threadId: "thr_a" } },
    ]);
  });

  it("does not write or publish when the mark is already what was asked for", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    const before = harness.inspection.realtimeSignals.length;

    await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    expect(harness.inspection.realtimeSignals).toHaveLength(before);
  });

  it("rejects an empty thread id at the wire boundary", async () => {
    const { harness } = await start();
    await expect(
      harness.behavior.callRpc("viewed_set", { ...A, threadId: "", viewed: true }),
    ).rejects.toThrow();
  });
});

describe("viewed_prune", () => {
  it("drops marks for files that left the diff", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    await harness.behavior.callRpc("viewed_set", {
      ...A,
      path: "src/b.ts",
      viewed: true,
    });

    const pruned = await harness.behavior.callRpc("viewed_prune", {
      threadId: "thr_a",
      presentPaths: ["src/a.ts"],
    });
    expect(pruned).toEqual({ record: { "src/a.ts": "+8 -4" } });
  });

  it("is a no-op when every mark is still present", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    const before = harness.inspection.realtimeSignals.length;

    await harness.behavior.callRpc("viewed_prune", {
      threadId: "thr_a",
      presentPaths: ["src/a.ts", "src/b.ts"],
    });
    expect(harness.inspection.realtimeSignals).toHaveLength(before);
  });
});

describe("filter", () => {
  it("starts off showing every file", async () => {
    const { harness } = await start();
    expect(await harness.behavior.callRpc("filter_get", null)).toEqual({
      onlyUnviewed: false,
    });
  });

  it("remembers Only unviewed", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("filter_set", { onlyUnviewed: true });
    expect(await harness.behavior.callRpc("filter_get", null)).toEqual({
      onlyUnviewed: true,
    });
  });
});

describe("problem_report", () => {
  it("accepts a problem from the content script", async () => {
    const { harness } = await start();
    expect(
      await harness.behavior.callRpc("problem_report", {
        message: "Could not read the changes panel's file list",
      }),
    ).toEqual({ ok: true });
  });
});

/**
 * A stand-in for `gh`: a script that appends its argv to a log and answers
 * the files query with `files`, or a mutation with an empty payload.
 */
function fakeGh(files: { path: string; additions: number; deletions: number; viewerViewedState: string }[]) {
  const dir = mkdtempSync(join(tmpdir(), "diff-viewed-gh-"));
  const log = join(dir, "calls.jsonl");
  const answer = JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          id: "PR_node",
          files: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: files },
        },
      },
    },
  });
  const script = join(dir, "gh");
  writeFileSync(
    script,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
const query = args.find((arg) => arg.startsWith("query=")) ?? "";
process.stdout.write(query.includes("mutation") ? "{}" : ${JSON.stringify(answer)});
`,
  );
  chmodSync(script, 0o755);
  const calls = (): string[][] => {
    try {
      return readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  };
  return { path: script, calls };
}

async function startSynced(gh: { path: string }, pullRequest = true) {
  const host = createFakePluginHost({
    pluginId: "diff-viewed",
    settings: { syncGithub: "on", ghPath: gh.path },
    sdk: {
      threads: {
        get: async () => makeThreadResponse({ id: "thr_a", environmentId: "env_a" }),
      },
      environments: {
        pullRequest: async () =>
          pullRequest
            ? {
                outcome: "available",
                pullRequest: {
                  number: 42,
                  title: "Polish the widgets",
                  url: "https://github.com/acme/widgets/pull/42",
                  state: "open",
                  baseRefName: "main",
                  headRefName: "bb/polish",
                  updatedAt: "2026-10-01T10:00:00Z",
                  attention: "none",
                  checks: null,
                  review: { state: "none", reviewRequestCount: 0 },
                  mergeability: { state: "mergeable", mergeStateStatus: "CLEAN", mergeable: "MERGEABLE" },
                },
              }
            : { outcome: "absent" },
      },
    } as never,
  });
  await plugin(host.bb);
  return host;
}

const mutations = (calls: string[][]) =>
  calls.filter((args) => args.some((arg) => arg.includes("mutation")));

describe("GitHub sync", () => {
  it("lists the pull request's files with the viewer's Viewed state", async () => {
    const gh = fakeGh([
      { path: "src/a.ts", additions: 8, deletions: 4, viewerViewedState: "VIEWED" },
      { path: "src/b.ts", additions: 1, deletions: 0, viewerViewedState: "DISMISSED" },
    ]);
    const { harness } = await startSynced(gh);

    const listed = await harness.behavior.callRpc("viewed_list", { threadId: "thr_a" });
    expect(listed).toEqual({
      record: {},
      github: {
        number: 42,
        url: "https://github.com/acme/widgets/pull/42",
        files: [
          { path: "src/a.ts", additions: 8, deletions: 4, viewed: true },
          { path: "src/b.ts", additions: 1, deletions: 0, viewed: false },
        ],
      },
    });
  });

  it("asks GitHub once while its answer is fresh", async () => {
    const gh = fakeGh([{ path: "src/a.ts", additions: 8, deletions: 4, viewerViewedState: "UNVIEWED" }]);
    const { harness } = await startSynced(gh);

    await Promise.all([
      harness.behavior.callRpc("viewed_list", { threadId: "thr_a" }),
      harness.behavior.callRpc("viewed_list", { threadId: "thr_a" }),
    ]);
    await harness.behavior.callRpc("viewed_list", { threadId: "thr_a" });
    expect(gh.calls()).toHaveLength(1);
  });

  it("marks a file viewed on GitHub when its diff matches", async () => {
    const gh = fakeGh([{ path: "src/a.ts", additions: 8, deletions: 4, viewerViewedState: "UNVIEWED" }]);
    const { harness } = await startSynced(gh);

    const set = await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    expect(set.github?.files[0]?.viewed).toBe(true);
    const [mutation] = mutations(gh.calls());
    expect(mutation?.join(" ")).toContain("markFileAsViewed");
    expect(mutation).toContain("id=PR_node");
    expect(mutation).toContain("path=src/a.ts");
  });

  it("unmarks a file on GitHub", async () => {
    const gh = fakeGh([{ path: "src/a.ts", additions: 8, deletions: 4, viewerViewedState: "VIEWED" }]);
    const { harness } = await startSynced(gh);

    const set = await harness.behavior.callRpc("viewed_set", { ...A, viewed: false });
    expect(set.github?.files[0]?.viewed).toBe(false);
    expect(mutations(gh.calls())[0]?.join(" ")).toContain("unmarkFileAsViewed");
  });

  it("marks a rename on GitHub under its current path", async () => {
    const gh = fakeGh([{ path: "src/new.ts", additions: 8, deletions: 4, viewerViewedState: "UNVIEWED" }]);
    const { harness } = await startSynced(gh);

    await harness.behavior.callRpc("viewed_set", { ...A, path: "src/old.ts -> src/new.ts", viewed: true });
    expect(mutations(gh.calls())[0]).toContain("path=src/new.ts");
  });

  it("keeps a mark local when the diff differs from GitHub's", async () => {
    const gh = fakeGh([{ path: "src/a.ts", additions: 5, deletions: 4, viewerViewedState: "UNVIEWED" }]);
    const { harness } = await startSynced(gh);

    const set = await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    expect(set.record).toEqual({ "src/a.ts": "+8 -4" });
    expect(mutations(gh.calls())).toHaveLength(0);
  });

  it("stays local without a pull request", async () => {
    const gh = fakeGh([]);
    const { harness } = await startSynced(gh, false);

    const set = await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    expect(set).toEqual({ record: { "src/a.ts": "+8 -4" }, github: null });
    expect(gh.calls()).toHaveLength(0);
  });

  it("stays local when gh is missing", async () => {
    const { harness } = await startSynced({ path: "/nonexistent/gh-does-not-exist" });

    const set = await harness.behavior.callRpc("viewed_set", { ...A, viewed: true });
    expect(set).toEqual({ record: { "src/a.ts": "+8 -4" }, github: null });
  });
});
