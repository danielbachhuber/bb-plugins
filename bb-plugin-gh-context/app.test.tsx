// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot, type RenderedSlot } from "@get-bb/plugin-sdk/testing/app";
import type { ThreadContext } from "./context/contract.js";

const app = await loadPluginApp(() => import("./app.js"));

let mounted: RenderedSlot | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

function context(overrides: Partial<ThreadContext> = {}): ThreadContext {
  return {
    archived: false,
    hide: true,
    pullRequest: {
      repo: "acme/widgets",
      number: 128,
      title: "Promote widgets into core",
      url: "https://github.com/acme/widgets/pull/128",
      state: "open",
      attention: "checks_pending",
      checks: { state: "pending", totalCount: 3, passedCount: 1, failedCount: 0, pendingCount: 2 },
      canMerge: true,
    },
    issues: [],
    changes: null,
    harvest: { available: false, running: null },
    ...overrides,
  };
}

function render(value: ThreadContext) {
  const banner = app.composerCustomizations.find((entry) => entry.id === "context")!.banners![0]!;
  mounted = renderSlot(banner, {}, {
    rpc: { threadContext: () => value },
    composer: { scope: { kind: "thread", threadId: "thr_one" } },
  });
  return mounted;
}

describe("registration", () => {
  it("adds a bare composer banner for threads, and the hiding script", () => {
    const customization = app.composerCustomizations.find((entry) => entry.id === "context")!;
    expect(customization.scopes).toEqual(["thread"]);
    expect(customization.banners?.map((banner) => [banner.id, banner.chrome])).toEqual([
      ["context", "bare"],
    ]);
    expect(app.contentScripts.map((script) => script.id)).toEqual(["hide-default-banner"]);
  });
});

describe("banner", () => {
  it("asks for this thread's context and shows its pull request", async () => {
    const slot = render(context());
    expect(await slot.findByText("PR #128")).toBeInTheDocument();
    expect(slot.inspection.rpcCalls[0]).toMatchObject({
      method: "threadContext",
      input: { threadId: "thr_one" },
    });
  });

  it("carries the hide marker only while hiding is on", async () => {
    const on = render(context());
    await on.findByText("PR #128");
    expect(on.container.querySelector("[data-gh-context-hide]")).not.toBeNull();
    on.unmount();

    const off = render(context({ hide: false }));
    await off.findByText("PR #128");
    expect(off.container.querySelector("[data-gh-context-banner]")).not.toBeNull();
    expect(off.container.querySelector("[data-gh-context-hide]")).toBeNull();
  });

  it("draws no card when there is nothing to show, but still hides bb's", async () => {
    const slot = render(context({ pullRequest: null }));
    await waitFor(() => expect(slot.inspection.rpcCalls.length).toBeGreaterThan(0));
    await waitFor(() =>
      expect(slot.container.querySelector("[data-gh-context-hide]")).not.toBeNull(),
    );
    expect(slot.container.querySelector(".rounded-lg")).toBeNull();
  });
});

describe("loading", () => {
  it("holds the banner open with a skeleton until the context arrives", async () => {
    let answer: (value: ThreadContext) => void = () => {};
    const banner = app.composerCustomizations.find((entry) => entry.id === "context")!.banners![0]!;
    mounted = renderSlot(banner, {}, {
      rpc: { threadContext: () => new Promise<ThreadContext>((resolve) => (answer = resolve)) },
      composer: { scope: { kind: "thread", threadId: "thr_loading" } },
    });
    const skeleton = await mounted.findByRole("status", { name: "Loading thread context" });
    expect(skeleton).toHaveAttribute("aria-busy", "true");
    // bb's banner stays hidden under the skeleton rather than flashing.
    expect(mounted.container.querySelector("[data-gh-context-hide]")).not.toBeNull();

    answer(context());
    expect(await mounted.findByText("PR #128")).toBeInTheDocument();
    expect(mounted.queryByRole("status", { name: "Loading thread context" })).toBeNull();
  });
});

describe("merged pull request", () => {
  it("suggests archiving the thread, and archives it", async () => {
    const slot = render(
      context({
        pullRequest: { ...context().pullRequest!, state: "merged", attention: "merged", checks: null },
      }),
    );
    const archive = await slot.findByRole("button", { name: "Archive thread" });
    expect(slot.queryByRole("button", { name: /merge/i })).toBeNull();
    fireEvent.click(archive);
    await waitFor(() =>
      expect(slot.inspection.rpcCalls.map((call) => call.method)).toContain("archiveThread"),
    );
  });

  it("does not offer it while the pull request is open", async () => {
    const slot = render(context());
    await slot.findByText("PR #128");
    expect(slot.queryByRole("button", { name: "Archive thread" })).toBeNull();
  });
});
