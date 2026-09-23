import { describe, expect, it } from "vitest";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createThreadLinksBridge } from "./links.js";

interface Call {
  pluginId: string;
  method: string;
  input: unknown;
}

function fakeBb(answer: (call: Call) => unknown): { bb: BbPluginApi; calls: Call[] } {
  const calls: Call[] = [];
  const bb = {
    sdk: {
      plugins: {
        async callRpc(args: Call & { outputSchema: { parse(value: unknown): unknown } }) {
          calls.push({ pluginId: args.pluginId, method: args.method, input: args.input });
          return args.outputSchema.parse(answer(args));
        },
      },
    },
  } as unknown as BbPluginApi;
  return { bb, calls };
}

describe("createThreadLinksBridge", () => {
  it("is available when gh-context answers, and not when the call throws", async () => {
    expect(await createThreadLinksBridge(fakeBb(() => []).bb).available()).toBe(true);
    const missing = fakeBb(() => {
      throw new Error("plugin not found");
    });
    expect(await createThreadLinksBridge(missing.bb).available()).toBe(false);
  });

  it("forwards link and unlink to gh-context", async () => {
    const { bb, calls } = fakeBb(() => null);
    const links = createThreadLinksBridge(bb);
    await links.linkThread({
      threadId: "thr_one",
      repo: "acme/widgets",
      kind: "pull",
      number: 128,
      source: "spawned:pr-sweep",
    });
    await links.unlinkThread({ threadId: "thr_one", source: "spawned:pr-sweep" });
    expect(calls.map(({ pluginId, method }) => `${pluginId}.${method}`)).toEqual([
      "gh-context.linkThread",
      "gh-context.unlinkThread",
    ]);
  });

  it("validates what comes back", async () => {
    const { bb } = fakeBb(() => [{ repo: "acme/widgets", kind: "pull", number: "128", threads: [] }]);
    await expect(
      createThreadLinksBridge(bb).threadsForItems([{ repo: "acme/widgets", kind: "pull", number: 128 }]),
    ).rejects.toThrow();
  });

  it("does not call gh-context for an empty list", async () => {
    const { bb, calls } = fakeBb(() => []);
    expect(await createThreadLinksBridge(bb).threadsForItems([])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("propagates a failure rather than answering empty", async () => {
    const { bb } = fakeBb(() => {
      throw new Error("plugin not found");
    });
    await expect(createThreadLinksBridge(bb).itemsForThread("thr_one")).rejects.toThrow(
      "plugin not found",
    );
  });
});
