// @vitest-environment jsdom
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

// The thunk matters: app.tsx binds the plugin runtime at module load, so the
// test runtime has to be installed before the import happens.
const app = await loadPluginApp(() => import("./app"));

const IDLE_RPC = {
  status: () => ({ configured: true, user: null, error: null }),
  runningTimer: () => ({ entry: null }),
  assignments: () => ({ projects: [] }),
  trackedHours: () => ({ hours: 0 }),
  lastSelection: () => null,
};

let cleanups: (() => void)[] = [];

afterEach(() => {
  for (const dispose of cleanups) dispose();
  cleanups = [];
});

function renderSettings(rpc: Record<string, unknown>) {
  const registration = app.settingsSections[0];
  if (registration === undefined) throw new Error("no settings section registered");

  const slot = renderSlot(registration, {}, { rpc: rpc as never });
  cleanups.push(() => slot.lifecycle.unmount());
  return slot;
}

describe("registrations", () => {
  test("registers no thread header action", () => {
    // The gh-context banner carries the timer, so a header clock would repeat it.
    expect(app.threadHeaderActions).toHaveLength(0);
  });

  test("registers a settings section for checking the connection", () => {
    expect(app.settingsSections).toHaveLength(1);
  });

  test("registers no nav panel", () => {
    // A sidebar entry was explicitly ruled out; this keeps it ruled out.
    expect(app.navPanels).toHaveLength(0);
  });
});

describe("the settings section", () => {
  test("reports who the stored credentials belong to", async () => {
    renderSettings({
      ...IDLE_RPC,
      status: () => ({
        configured: true,
        user: { name: "Daniel Bachhuber", accountName: "New_ Public" },
        error: null,
      }),
    });

    expect(await screen.findByText(/Daniel Bachhuber/)).toBeTruthy();
    expect(screen.getByText(/New_ Public/)).toBeTruthy();
  });

  test("says the credentials are missing rather than showing an error", async () => {
    renderSettings({
      ...IDLE_RPC,
      status: () => ({ configured: false, user: null, error: null }),
    });

    expect(await screen.findByText(/not configured/i)).toBeTruthy();
  });

  test("distinguishes a rejected token from an unreachable Harvest", async () => {
    renderSettings({
      ...IDLE_RPC,
      status: () => ({ configured: true, user: null, error: "unauthenticated" }),
    });

    expect(await screen.findByText(/rejected/i)).toBeTruthy();
  });

  test("says Harvest is unreachable when it cannot be reached", async () => {
    renderSettings({
      ...IDLE_RPC,
      status: () => ({ configured: true, user: null, error: "unreachable" }),
    });

    expect(await screen.findByText(/could not be reached/i)).toBeTruthy();
  });
});
