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

/** A host whose thread has one environment, based on origin/main, with one changed file in every diff unless given others. */
async function start(files: object[] = [FILE], patchFor: (path: string) => string = () => PATCH) {
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
          return { outcome: "available", truncated: false, files };
        },
        diffPatch: async ({ paths }: { paths: string[] }) => ({ patches: paths.map((path) => ({ path, patch: patchFor(path) })) }),
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

describe("bb super-diff read", () => {
  it("prints the guide, the file list, and every patch in one output", async () => {
    const lockfile = { ...FILE, path: "package-lock.json" };
    const { cli } = await start([FILE, lockfile]);
    const result = await cli("read");
    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.stdout).toMatch(/^# Write a Super Diff/);
    expect(result.stdout).toContain("All changes against origin/main, 2 files");
    expect(result.stdout).toContain("package-lock.json (modified, +1 -0) [placed by rule]");
    expect(result.stdout).toContain(`### src/a.ts\n${PATCH}`);
    // A file placed by rule needs no patch, since the agent leaves it out.
    expect(result.stdout).not.toContain("### package-lock.json");
    expect(result.stdout).toContain("That is every patch.");
  });

  it("stops before the output grows large and names the paths left, with the same target", async () => {
    const files = ["src/a.ts", "src/b.ts", "src/c.ts"].map((path) => ({ ...FILE, path }));
    const { cli } = await start(files, () => `@@ -1 +1 @@\n+${"x".repeat(80_000)}\n`);
    const result = await cli("read", "--target", "uncommitted");
    expect(result.stdout).toContain("### src/a.ts");
    expect(result.stdout).toContain("### src/b.ts");
    expect(result.stdout).not.toContain("### src/c.ts");
    expect(result.stdout).toContain("Read the rest with: bb super-diff patch src/c.ts --target uncommitted");
  });
});

describe("superdiff_version", () => {
  const version = async (harness: Awaited<ReturnType<typeof start>>["harness"], target: object) =>
    (await harness.behavior.callRpc("superdiff_version", { threadId: "thr_a", target })) as { acceptedAt: string | null; requestedAt: string | null };

  it("moves when a submission from the command line replaces the stored one, so the Diff tab can pick it up", async () => {
    const { cli, stored, harness } = await start();
    expect(await version(harness, ALL)).toEqual({ acceptedAt: null, requestedAt: null });

    await cli("submit", submissionFile());
    const first = await version(harness, ALL);
    expect(first.acceptedAt).toBe(((await stored(ALL)) as { acceptedAt?: string } | null)?.acceptedAt);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await cli("submit", submissionFile());
    expect((await version(harness, ALL)).acceptedAt! > first.acceptedAt!).toBe(true);
    expect(await version(harness, UNCOMMITTED)).toEqual({ acceptedAt: null, requestedAt: null });
  });

  it("reports a Generate request only for the diff it asked about", async () => {
    const { harness } = await start();
    await harness.behavior.callRpc("superdiff_generate", { threadId: "thr_a", target: ALL });
    expect((await version(harness, ALL)).requestedAt).not.toBeNull();
    expect((await version(harness, UNCOMMITTED)).requestedAt).toBeNull();
  });
});
