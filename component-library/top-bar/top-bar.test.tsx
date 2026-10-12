// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { findTopBarAnchor, onPath, TopBarCount, TopBarSlot } from "./top-bar";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

/** A top bar like bb's: a row of buttons ending in the right-panel toggle. */
function topBar(label = "Show right panel (⌘ J)") {
  const row = document.createElement("div");
  row.style.display = "flex";
  const other = document.createElement("button");
  other.setAttribute("aria-label", "Project settings");
  const toggle = document.createElement("button");
  toggle.setAttribute("aria-label", label);
  row.append(other, toggle);
  document.body.append(row);
  return { row, toggle };
}

describe("findTopBarAnchor", () => {
  it("finds the right-panel toggle whether the panel is open or shut", () => {
    const { row, toggle } = topBar("Hide right panel");
    expect(findTopBarAnchor(document)).toEqual({ parent: row, before: toggle });
  });

  it("takes the last toggle when a split thread draws two", () => {
    topBar();
    const { toggle } = topBar();
    expect(findTopBarAnchor(document)?.before).toBe(toggle);
  });

  it("falls back to the start of the header's actions on a page without a toggle", () => {
    const row = document.createElement("div");
    row.setAttribute("data-app-page-header-actions", "");
    const refresh = document.createElement("button");
    row.append(refresh);
    document.body.append(row);
    expect(findTopBarAnchor(document)).toEqual({ parent: row, before: refresh });
  });

  it("finds nothing on a page with neither", () => {
    expect(findTopBarAnchor(document)).toBeNull();
  });
});

describe("onPath", () => {
  it("matches a prefix and the paths under it, not a longer name", () => {
    expect(onPath("/plugins/now/now", ["/plugins/now/now"])).toBe(true);
    expect(onPath("/plugins/now/now/email", ["/plugins/now/now"])).toBe(true);
    expect(onPath("/plugins/now/nowhere", ["/plugins/now/now"])).toBe(false);
  });
});

describe("TopBarSlot", () => {
  it("puts its children just before the toggle", async () => {
    const { toggle } = topBar();
    render(<TopBarSlot pluginId="test"><span>chip</span></TopBarSlot>);
    const chip = await screen.findByText("chip");
    expect(chip.parentElement?.nextElementSibling).toBe(toggle);
    // bb scopes the plugin's stylesheet to this attribute.
    expect(chip.parentElement).toHaveAttribute("data-bb-plugin", "test");
  });

  it("moves to the new toggle when bb draws another page", async () => {
    const first = topBar();
    render(<TopBarSlot pluginId="test"><span>chip</span></TopBarSlot>);
    await screen.findByText("chip");
    first.row.remove();
    const second = topBar();
    await waitFor(() => expect(screen.getByText("chip").parentElement?.nextElementSibling).toBe(second.toggle));
  });

  it("marks its button as the current page under a path in activeOn", async () => {
    window.history.replaceState(null, "", "/plugins/now/now");
    topBar();
    render(
      <TopBarSlot pluginId="test" activeOn={["/plugins/now/now"]}>
        <TopBarCount icon={<svg />} label="Open Now" onClick={() => {}} urgent={0} total={1} urgentLabel="" totalLabel="1" />
      </TopBarSlot>,
    );
    expect(await screen.findByRole("button", { name: "Open Now" })).toHaveAttribute("aria-current", "page");
  });

  it("leaves its button unmarked on other pages", async () => {
    topBar();
    render(
      <TopBarSlot pluginId="test" activeOn={["/plugins/now/now"]}>
        <TopBarCount icon={<svg />} label="Open Now" onClick={() => {}} urgent={0} total={1} urgentLabel="" totalLabel="1" />
      </TopBarSlot>,
    );
    expect(await screen.findByRole("button", { name: "Open Now" })).not.toHaveAttribute("aria-current");
  });

  it("lines several plugins' slots up by order, and they stay put", async () => {
    const { toggle } = topBar();
    render(
      <>
        <TopBarSlot pluginId="review-sweep" order={2}><span>reviews</span></TopBarSlot>
        <TopBarSlot pluginId="now" order={0}><span>now</span></TopBarSlot>
        <TopBarSlot pluginId="issue-sweep" order={1}><span>issues</span></TopBarSlot>
      </>,
    );
    const order = () => [...toggle.parentElement!.children].map((child) => child.textContent || child.getAttribute("aria-label"));
    await waitFor(() => expect(order()).toEqual(["Project settings", "now", "issues", "reviews", "Show right panel (⌘ J)"]));
    // Once settled, no slot moves again; two slots that disagreed would swap places every frame.
    const moves: MutationRecord[] = [];
    const watch = new MutationObserver((records) => moves.push(...records));
    watch.observe(toggle.parentElement!, { childList: true });
    await new Promise((resolve) => setTimeout(resolve, 100));
    watch.disconnect();
    expect(moves).toEqual([]);
  });

  it("goes before the header's own buttons, after other slots, on a page without a toggle", async () => {
    const row = document.createElement("div");
    row.setAttribute("data-app-page-header-actions", "");
    const refresh = document.createElement("button");
    refresh.textContent = "Refresh";
    row.append(refresh);
    document.body.append(row);
    render(
      <>
        <TopBarSlot pluginId="b"><span>b</span></TopBarSlot>
        <TopBarSlot pluginId="a"><span>a</span></TopBarSlot>
      </>,
    );
    await waitFor(() => expect([...row.children].map((child) => child.textContent)).toEqual(["a", "b", "Refresh"]));
  });

  it("takes its element out when it unmounts", async () => {
    topBar();
    const { unmount } = render(<TopBarSlot pluginId="test"><span>chip</span></TopBarSlot>);
    await screen.findByText("chip");
    unmount();
    expect(document.querySelector('[data-top-bar-slot="test"]')).toBeNull();
  });
});

describe("TopBarCount", () => {
  it("draws the icon and the sidebar counts in one button", () => {
    const onClick = vi.fn();
    render(
      <TopBarCount
        icon={<svg data-testid="icon" />}
        label="Open Now"
        onClick={onClick}
        urgent={2}
        soon={3}
        total={9}
        urgentLabel="2 urgent"
        soonLabel="3 due today"
        totalLabel="9 in Now"
      />,
    );
    const button = screen.getByRole("button", { name: "Open Now" });
    expect(button).toContainElement(screen.getByTestId("icon"));
    expect(button).toHaveTextContent("239");
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("shows only the icon at a total of zero", () => {
    render(<TopBarCount icon={<svg />} label="Open Now" onClick={() => {}} urgent={0} total={0} urgentLabel="" totalLabel="" />);
    expect(screen.getByRole("button", { name: "Open Now" })).toHaveTextContent("");
  });
});
