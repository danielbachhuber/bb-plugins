// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { onlyGoalHostChanges, placeBandHost, placeRowHosts, ROW_HOST_ATTRIBUTE } from "./goal-hosts.js";

// The shape of bb's thread pane: the header, with plugin header actions in
// it, then the conversation window.
function pane(): { anchor: HTMLElement; header: HTMLElement } {
  document.body.innerHTML = `
    <div data-split-pane-id="p1">
      <header id="header">
        <p><span class="bb-thread-title">Add a CSV export</span></p>
        <div class="actions"><span role="group"><span id="anchor"></span></span></div>
      </header>
      <div data-thread-window><div class="scroller"></div></div>
    </div>`;
  return { anchor: document.getElementById("anchor")!, header: document.getElementById("header")! };
}

// The shape of a sidebar row: the link, then the span holding the title.
function rows(ids: string[]): void {
  document.body.innerHTML = ids
    .map(
      (id) => `
      <div class="row">
        <a data-sidebar-thread-id="${id}" href="#"></a>
        <span class="title-wrap"><span class="provider"></span><span class="bb-thread-title">${id}</span></span>
      </div>`,
    )
    .join("");
}

describe("placeBandHost", () => {
  it("puts the band between the header and the conversation, once", () => {
    const { anchor, header } = pane();
    const host = document.createElement("div");
    host.setAttribute("data-tokenomics-goal", "thr_a");
    expect(placeBandHost(anchor, host)).toBe(true);
    expect(placeBandHost(anchor, host)).toBe(true);
    expect(header.nextElementSibling).toBe(host);
    expect(host.nextElementSibling?.hasAttribute("data-thread-window")).toBe(true);
    expect(document.querySelectorAll("[data-tokenomics-goal]")).toHaveLength(1);
  });

  it("removes the band when the conversation no longer follows the header", () => {
    const { anchor } = pane();
    const host = document.createElement("div");
    host.setAttribute("data-tokenomics-goal", "thr_a");
    placeBandHost(anchor, host);
    document.querySelector("[data-thread-window]")!.remove();
    expect(placeBandHost(anchor, host)).toBe(false);
    expect(host.isConnected).toBe(false);
  });
});

describe("placeRowHosts", () => {
  it("places a host after the title of each row with a goal and leaves the rest alone", () => {
    rows(["thr_a", "thr_b"]);
    const hosts = placeRowHosts(document, new Set(["thr_a"]), new Map());
    expect([...hosts.keys()]).toEqual(["thr_a"]);
    const title = document.querySelector('[data-sidebar-thread-id="thr_a"]')!.parentElement!.querySelector(".bb-thread-title")!;
    expect(title.nextElementSibling).toBe(hosts.get("thr_a"));
    expect(document.querySelectorAll(`[${ROW_HOST_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it("keeps a row's host across passes and removes it once the goal is gone", () => {
    rows(["thr_a"]);
    const first = placeRowHosts(document, new Set(["thr_a"]), new Map());
    const second = placeRowHosts(document, new Set(["thr_a"]), first);
    expect(second.get("thr_a")).toBe(first.get("thr_a"));
    placeRowHosts(document, new Set(), second);
    expect(document.querySelectorAll(`[${ROW_HOST_ATTRIBUTE}]`)).toHaveLength(0);
  });
});

describe("onlyGoalHostChanges", () => {
  it("ignores changes inside the hosts it placed", async () => {
    rows(["thr_a"]);
    const hosts = placeRowHosts(document, new Set(["thr_a"]), new Map());
    const records: MutationRecord[] = [];
    const observer = new MutationObserver((found) => records.push(...found));
    observer.observe(document.body, { childList: true, subtree: true });
    hosts.get("thr_a")!.appendChild(document.createElement("span"));
    await Promise.resolve();
    expect(onlyGoalHostChanges(records)).toBe(true);
    document.body.appendChild(document.createElement("div"));
    await Promise.resolve();
    expect(onlyGoalHostChanges(records)).toBe(false);
    observer.disconnect();
  });
});
