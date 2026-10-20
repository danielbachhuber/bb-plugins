import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const PATCH = "@@ -1 +1,2 @@\n export const a = 1;\n+export const b = 2;\n";
const FILE = { path: "src/a.ts", previousPath: null, changeKind: "modified", additions: 1, deletions: 0, binary: false, loadMode: "auto" };
const SUBMISSION = {
  concerns: [{ title: "Export b", explanation: "Adds a second export.", files: ["src/a.ts"], summaries: { "src/a.ts": "Exports b" } }],
  annotations: [],
};
const ALL = { type: "all", mergeBaseBranch: "origin/main" } as const;
const UNCOMMITTED = { type: "uncommitted" } as const;

/** A host whose thread has one environment, based on origin/main, with one changed file in every diff. */
async function start() {
  const diffQueries: unknown[] = [];
  const host = createFakePluginHost({
    pluginId: "super-diff",
    sdk: {
      threads: {
        get: async () => makeThreadResponse({ id: "thr_a", environmentId: "env_a" }),
        send: async () => ({}),
      },
      environments: {
        get: async () => ({ id: "env_a", mergeBaseBranch: "origin/main" }),
        diffFiles: async (query: unknown) => {
          diffQueries.push(query);
          return { outcome: "available", truncated: false, files: [FILE] };
        },
        diffPatch: async ({ paths }: { paths: string[] }) => ({ patches: paths.map((path) => ({ path, patch: PATCH })) }),
      },
    } as never,
  });
  await plugin(host.bb);
  const cli = (...argv: string[]) => host.harness.behavior.runCli(argv, { threadId: "thr_a" } as never);
  const stored = async (target: object) => {
    const result = (await host.harness.behavior.callRpc("superdiff_get", { threadId: "thr_a", target })) as { stored: string | null };
    return result.stored === null ? null : (JSON.parse(result.stored) as { target: unknown });
  };
  return { ...host, cli, stored, diffQueries };
}

function submissionFile(): string {
  const file = join(mkdtempSync(join(tmpdir(), "super-diff-")), "submission");
  writeFileSync(file, JSON.stringify(SUBMISSION));
  return file;
}

describe("bb super-diff --target", () => {
  it("reads All changes when nobody pressed Generate and no target is given", async () => {
    const { cli, diffQueries } = await start();
    const result = await cli("files");
    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toMatch(/^All changes against origin\/main, 1 files/);
    expect(diffQueries).toEqual([{ environmentId: "env_a", target: "all", mergeBaseBranch: "origin/main" }]);
  });

  it("reads the diff each target names", async () => {
    const { cli, diffQueries } = await start();
    expect((await cli("files", "--target", "uncommitted")).stdout).toMatch(/^Uncommitted changes, /);
    expect((await cli("files", "--target", "committed")).stdout).toMatch(/^Committed changes against origin\/main, /);
    expect(diffQueries).toEqual([
      { environmentId: "env_a", target: "uncommitted" },
      { environmentId: "env_a", target: "branch_committed", mergeBaseBranch: "origin/main" },
    ]);
  });

  it("stores a submission under the target it names, where the Diff tab looks for it", async () => {
    const { cli, stored } = await start();
    const result = await cli("submit", submissionFile(), "--target", "uncommitted");
    expect(result).toMatchObject({ exitCode: 0 });
    expect((await stored(UNCOMMITTED))?.target).toEqual(UNCOMMITTED);
    expect(await stored(ALL)).toBeNull();
  });

  it("uses an explicit target over a Generate request for another diff, and leaves the request waiting", async () => {
    const { cli, stored, harness } = await start();
    await harness.behavior.callRpc("superdiff_generate", { threadId: "thr_a", target: ALL });

    expect(await cli("submit", submissionFile(), "--target", "uncommitted")).toMatchObject({ exitCode: 0 });
    expect(await stored(ALL)).toBeNull();
    const all = (await harness.behavior.callRpc("superdiff_get", { threadId: "thr_a", target: ALL })) as { requestedAt: string | null };
    expect(all.requestedAt).not.toBeNull();

    // Without --target, the agent answering that request still writes for its diff.
    expect(await cli("submit", submissionFile())).toMatchObject({ exitCode: 0 });
    expect((await stored(ALL))?.target).toEqual(ALL);
  });

  it("rejects a target it does not know, before reading the diff", async () => {
    const { cli, diffQueries } = await start();
    for (const argv of [["files", "--target", "staged"], ["files", "--target"]]) {
      expect(await cli(...argv)).toMatchObject({ exitCode: 1, stderr: "--target takes all, uncommitted, or committed." });
    }
    expect(diffQueries).toEqual([]);
  });

  it("does not read the target's value as a patch path", async () => {
    const { cli } = await start();
    const result = await cli("patch", "--target", "all", "src/a.ts");
    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toContain("### src/a.ts");
  });
});
