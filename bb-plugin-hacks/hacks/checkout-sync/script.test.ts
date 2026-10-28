// Against real files and a real shell in a temporary directory.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSyncScripts } from "./script";

let root: string;
let checkout: string;
let state: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sync-script-"));
  checkout = join(root, "checkout");
  state = join(root, "state");
  mkdirSync(checkout);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function finished(read: () => { state: string } | null): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (read()?.state !== "running") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("the script did not finish");
}

describe("createSyncScripts", () => {
  it("has nothing for a checkout without a sync script", () => {
    const scripts = createSyncScripts(state);
    expect(scripts.start(checkout)).toBeNull();
    expect(scripts.state(checkout)).toBeNull();
  });

  it("has no run before the first one", () => {
    writeFileSync(join(checkout, "sync.sh"), "exit 0\n");
    expect(createSyncScripts(state).state(checkout)).toBeNull();
  });

  it("runs the script in the checkout and records that it succeeded, with its output", async () => {
    writeFileSync(join(checkout, "sync.sh"), "#!/bin/sh\npwd\necho built\n");
    chmodSync(join(checkout, "sync.sh"), 0o755);
    const scripts = createSyncScripts(state);

    expect(scripts.start(checkout)).toMatchObject({ script: "sync.sh", state: "running" });
    await finished(() => scripts.state(checkout));

    const run = scripts.state(checkout)!;
    expect(run).toMatchObject({ script: "sync.sh", state: "succeeded", exitCode: 0 });
    expect(readFileSync(run.log, "utf8")).toMatch(/checkout\nbuilt\n$/);
  });

  it("runs a script that is not executable under bash, and records a failure", async () => {
    mkdirSync(join(checkout, ".bb"));
    writeFileSync(join(checkout, ".bb", "sync"), "echo nope >&2\nexit 3\n");
    const scripts = createSyncScripts(state);

    scripts.start(checkout);
    await finished(() => scripts.state(checkout));

    const run = scripts.state(checkout)!;
    expect(run).toMatchObject({ script: ".bb/sync", state: "failed", exitCode: 3 });
    expect(readFileSync(run.log, "utf8")).toBe("nope\n");
  });

  it("never reads a run as missing while the wrapper writes its state", async () => {
    writeFileSync(join(checkout, "sync.sh"), "exit 0\n");
    const scripts = createSyncScripts(state);
    for (let i = 0; i < 20; i++) {
      scripts.start(checkout);
      let run = scripts.state(checkout);
      while (run?.state === "running") {
        await new Promise((resolve) => setImmediate(resolve));
        run = scripts.state(checkout);
      }
      expect(run).toMatchObject({ state: "succeeded" });
    }
  });

  it("reads a run started by an earlier server", async () => {
    writeFileSync(join(checkout, "sync.sh"), "exit 0\n");
    createSyncScripts(state).start(checkout);
    const later = createSyncScripts(state);
    await finished(() => later.state(checkout));
    expect(later.state(checkout)).toMatchObject({ state: "succeeded" });
  });
});
