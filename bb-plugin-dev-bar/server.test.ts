import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const ARCHIVED = makeThreadResponse({ id: "thr_one", environmentId: "env_one", archivedAt: 1_700_000_000_000 });
const DELETED = makeThreadResponse({ id: "thr_one", environmentId: "env_one", deletedAt: 1_700_000_000_000 });

/** A checkout whose stop command appends each id it stops to stopped.log. */
function checkout(): string {
  const root = mkdtempSync(join(tmpdir(), "dev-bar-archive-"));
  mkdirSync(join(root, ".bb"));
  writeFileSync(
    join(root, ".bb/dev-bar.json"),
    JSON.stringify({ status: "cat status.json", start: "true", stop: "echo {id} >> stopped.log" }),
  );
  writeFileSync(
    join(root, "status.json"),
    JSON.stringify({
      services: [
        { id: "web", state: "running" },
        { id: "worker", state: "starting" },
        { id: "db", state: "stopped" },
      ],
    }),
  );
  return root;
}

async function end(event: "thread.archived" | "thread.deleted", root: string, liveThreads: string[]) {
  const thread = event === "thread.archived" ? ARCHIVED : DELETED;
  const { bb, harness } = createFakePluginHost({
    pluginId: "dev-bar",
    sdk: {
      threads: {
        // bb answers 404 for a deleted thread, so the plugin has to use the event's copy.
        get: async () => {
          if (event === "thread.deleted") throw new Error("Thread not found");
          return thread;
        },
        list: async () => liveThreads.map((id) => makeThreadResponse({ id, environmentId: "env_one" })),
      },
      environments: {
        get: async () => ({ id: "env_one", path: root }),
      },
    },
  });
  await plugin(bb);
  return harness.emitThreadEvent(event, { thread });
}

describe.each([
  ["archiving", "thread.archived"],
  ["deleting", "thread.deleted"],
] as const)("%s a thread", (_, event) => {
  it("stops the running services when it was the checkout's last live thread", async () => {
    const root = checkout();
    const { errors } = await end(event, root, []);
    expect(errors).toEqual([]);
    expect(readFileSync(join(root, "stopped.log"), "utf8")).toBe("web\nworker\n");
  });

  it("leaves them running while another thread uses the checkout", async () => {
    const root = checkout();
    await end(event, root, ["thr_two"]);
    expect(existsSync(join(root, "stopped.log"))).toBe(false);
  });
});

describe("the strip", () => {
  /** A checkout whose status command needs a program that isn't installed, with a pnpm lockfile. */
  function uninstalled(): string {
    const root = mkdtempSync(join(tmpdir(), "dev-bar-setup-"));
    mkdirSync(join(root, ".bb"));
    writeFileSync(
      join(root, ".bb/dev-bar.json"),
      JSON.stringify({
        status: "dev-bar-missing-program status",
        install: "echo installed > installed.log",
        actions: [{ label: "Start all", command: "true" }],
      }),
    );
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    return root;
  }

  async function host(root: string, status: string) {
    const { bb, harness } = createFakePluginHost({
      pluginId: "dev-bar",
      sdk: {
        threads: { get: async () => makeThreadResponse({ id: "thr_one", environmentId: "env_one" }) },
        environments: { get: async () => ({ id: "env_one", path: root, status }) },
      },
    });
    await plugin(bb);
    return harness;
  }

  it("says the checkout is setting up while bb provisions it, without running the status command", async () => {
    const harness = await host(uninstalled(), "provisioning");
    expect(await harness.callRpc("strip", { threadId: "thr_one" })).toEqual({
      kind: "setting-up",
      actions: [{ index: 0, label: "Start all", confirm: null }],
    });
  });

  it("offers to install when a program is missing once setup is done, and the install runs", async () => {
    const root = uninstalled();
    const harness = await host(root, "ready");
    const strip = (await harness.callRpc("strip", { threadId: "thr_one" })) as { install: unknown };
    expect(strip.install).toEqual({ command: "echo installed > installed.log", missing: "dev-bar-missing-program" });
    expect(await harness.callRpc("run", { threadId: "thr_one", target: { kind: "install" } })).toEqual({ failure: null });
    expect(readFileSync(join(root, "installed.log"), "utf8")).toBe("installed\n");
  });
});
