import { describe, expect, it } from "vitest";
import {
  createSweepLinks,
  ownThreadIds,
  unclaimedPromptThreadIds,
  type ThreadLinksBridge,
} from "./links.js";

const entry = {
  repo: "acme/widgets",
  kind: "pull" as const,
  number: 42,
  threads: [
    { threadId: "thr_old", source: "spawned:pr-sweep" },
    { threadId: "thr_prompted", source: "prompt" },
    { threadId: "thr_old", source: "prompt" },
    { threadId: "thr_other", source: "spawned:review-sweep" },
    { threadId: "thr_new", source: "adopted:pr-sweep" },
  ],
};

describe("ownThreadIds", () => {
  it("lists this sweep's threads newest first, each once", () => {
    expect(ownThreadIds(entry, "pr-sweep")).toEqual(["thr_new", "thr_old"]);
  });
});

describe("unclaimedPromptThreadIds", () => {
  it("lists prompt-linked threads this sweep has not claimed", () => {
    expect(unclaimedPromptThreadIds(entry, "pr-sweep")).toEqual(["thr_prompted"]);
  });
});

function fakeBridge(): ThreadLinksBridge & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    available: async () => true,
    linkThread: async (input) => {
      calls.push(["link", input]);
    },
    unlinkThread: async (input) => {
      calls.push(["unlink", input]);
    },
    threadsForItems: async (items) => items.map((item) => ({ ...item, threads: entry.threads })),
    itemsForThread: async () => [],
  };
}

describe("createSweepLinks", () => {
  it("keys the map by the row's own repository spelling", async () => {
    const links = createSweepLinks(fakeBridge(), "pr-sweep", "pull");
    const map = await links.threadMap([{ repo: "Acme/Widgets", number: 42 }]);
    expect(map.get("Acme/Widgets#42")).toEqual(["thr_new", "thr_old"]);
  });

  it("links with this sweep's source, and releases only its own", async () => {
    const bridge = fakeBridge();
    const links = createSweepLinks(bridge, "pr-sweep", "pull");
    await links.link("acme/widgets", 42, "thr_one", "spawned");
    await links.release("thr_one");
    expect(bridge.calls).toEqual([
      ["link", { threadId: "thr_one", repo: "acme/widgets", kind: "pull", number: 42, source: "spawned:pr-sweep" }],
      ["unlink", { threadId: "thr_one", source: "spawned:pr-sweep" }],
      ["unlink", { threadId: "thr_one", source: "adopted:pr-sweep" }],
    ]);
  });
});

describe("createSweepLinks options", () => {
  it("runs the before hook ahead of every read and write", async () => {
    const order: string[] = [];
    const bridge = fakeBridge();
    const links = createSweepLinks(bridge, "pr-sweep", "pull", {
      before: async () => {
        order.push("before");
      },
    });
    await links.threadFor("acme/widgets", 42);
    await links.link("acme/widgets", 42, "thr_one", "spawned");
    expect(order).toEqual(["before", "before"]);
  });

  it("retries recording a link before giving up", async () => {
    let failures = 2;
    const bridge = fakeBridge();
    const flaky = {
      ...bridge,
      linkThread: async (input: Parameters<typeof bridge.linkThread>[0]) => {
        if (failures-- > 0) throw new Error("gh-context is reloading");
        return bridge.linkThread(input);
      },
    };
    await createSweepLinks(flaky, "pr-sweep", "pull", { retryDelayMs: 0 }).link(
      "acme/widgets",
      42,
      "thr_one",
      "spawned",
    );
    expect(bridge.calls).toHaveLength(1);

    const broken = { ...bridge, linkThread: async () => Promise.reject(new Error("gone")) };
    await expect(
      createSweepLinks(broken, "pr-sweep", "pull", { retryDelayMs: 0 }).link("acme/widgets", 42, "thr_two", "spawned"),
    ).rejects.toThrow("gone");
  });
});
