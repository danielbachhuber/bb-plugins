// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { Deck } from "./server";

afterEach(cleanup);

beforeAll(() => {
  // jsdom has no ResizeObserver. The stage only needs it to size the canvas.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const deck: Deck = {
  name: "widgets-launch",
  path: "presentations/widgets-launch",
  problem: null,
  fileRoot: { kind: "workspace", environmentId: "env_acme", dir: "presentations/widgets-launch" },
  slides: [
    { file: "01-title.md", title: "Widgets 2.0", content: "# Widgets 2.0", sha256: "a" },
    { file: "02-why.md", title: "Why now", content: "## Why now", sha256: "b" },
    { file: "03-thanks.md", title: "Thanks", content: "# Thanks", sha256: "c" },
  ],
};

describe("registration", () => {
  it("adds the page, the header button, and the panel", async () => {
    const app = await loadPluginApp(() => import("./app"));
    expect(app.navPanels).toMatchObject([{ id: "presentations", path: "presentations" }]);
    expect(app.threadHeaderActions).toMatchObject([{ id: "present" }]);
    expect(app.threadPanelActions).toMatchObject([{ id: "slides", layout: "flush" }]);
  });
});

describe("the Present button", () => {
  async function renderHeader(isDeck: boolean) {
    const app = await loadPluginApp(() => import("./app"));
    return renderSlot(
      app.threadHeaderActions[0]!,
      { threadId: "thr_deck", projectId: "proj_acme", isCompactViewport: false },
      { rpc: { deck_info: () => ({ isDeck }) } },
    );
  }

  it("opens the slides panel", async () => {
    const slot = await renderHeader(true);
    fireEvent.click(await slot.findByRole("button", { name: "Present" }));
    expect(slot.inspection.navigateCalls).toContainEqual(
      expect.objectContaining({ method: "openThreadPanel" }),
    );
  });

  it("stays hidden in a thread with no deck", async () => {
    const slot = await renderHeader(false);
    await waitFor(() => {
      expect(slot.inspection.rpcCalls).toContainEqual({
        method: "deck_info",
        input: { threadId: "thr_deck" },
      });
    });
    expect(slot.queryByRole("button", { name: "Present" })).toBeNull();
  });
});

describe("the Slides panel", () => {
  async function renderPanel() {
    const app = await loadPluginApp(() => import("./app"));
    return renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr_deck", params: null },
      {
        rpc: {
          deck_load: () => deck,
          asset_base: () => ({ routePath: "/api/v1/plugins/presentations/http/asset" }),
        },
      },
    );
  }

  it("loads the thread's deck and lists every slide file", async () => {
    const slot = await renderPanel();
    expect(await slot.findByText("01-title.md")).toBeTruthy();
    expect(slot.getByText("03-thanks.md")).toBeTruthy();
    expect(slot.inspection.rpcCalls).toContainEqual({
      method: "deck_load",
      input: { threadId: "thr_deck" },
    });
    expect(slot.getByRole("link", { name: "Edit 02-why.md" })).toBeTruthy();
  });

  it("moves with the keyboard and stops at the last slide", async () => {
    const slot = await renderPanel();
    await slot.findByText("1 / 3");
    const stage = slot.getByRole("region", { name: "Slide" });
    fireEvent.keyDown(stage, { key: "PageDown" });
    expect(slot.getByText("2 / 3")).toBeTruthy();
    fireEvent.keyDown(stage, { key: "End" });
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    expect(slot.getByText("3 / 3")).toBeTruthy();
  });

  it("jumps to a slide picked from the list", async () => {
    const slot = await renderPanel();
    fireEvent.click(await slot.findByText("Thanks"));
    expect(slot.getByText("3 / 3")).toBeTruthy();
  });
});
