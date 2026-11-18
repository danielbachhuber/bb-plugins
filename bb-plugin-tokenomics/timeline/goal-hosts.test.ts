// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { onlyGoalHostChanges, placeRowHosts, ROW_HOST_ATTRIBUTE, SLOT_ATTRIBUTE } from "./goal-hosts.js";
import { keepsBbIcon, rowStateOf } from "../components/row-activity.js";

// The shape of a sidebar row: the link, the title, then the trailing area
// with bb's icon box: its icon in a fading span, and the hover buttons.
function rows(ids: string[], label = "Thread working"): void {
  document.body.innerHTML = ids
    .map(
      (id) => `
      <div class="row">
        <span class="inner"><a data-sidebar-thread-id="${id}" href="#"></a><span class="bb-thread-title">${id}</span></span>
        <span data-sidebar-thread-trailing>
          <span class="end">
            <span class="relative shrink-0 h-7 w-7" id="box-${id}">
              <span class="bb-sidebar-hover-actions-fade"><span data-sidebar-thread-trailing-indicator><svg aria-label="${label}"></svg></span></span>
              <div class="bb-sidebar-hover-actions"><button aria-label="Archive"></button></div>
            </span>
          </span>
        </span>
      </div>`,
    )
    .join("");
}

describe("placeRowHosts", () => {
  it("puts the donut after bb's icon box, collapses the box, and reads bb's state", () => {
    rows(["thr_a", "thr_b"]);
    const { hosts, labels } = placeRowHosts(document, new Set(["thr_a"]), new Map());
    expect([...hosts.keys()]).toEqual(["thr_a"]);
    const box = document.getElementById("box-thr_a")!;
    expect(box.nextElementSibling).toBe(hosts.get("thr_a"));
    expect(box.hasAttribute(SLOT_ATTRIBUTE)).toBe(true);
    expect(document.getElementById("box-thr_b")!.hasAttribute(SLOT_ATTRIBUTE)).toBe(false);
    expect(labels.get("thr_a")).toBe("Thread working");
    // The plugin's stylesheet applies only under this.
    expect(hosts.get("thr_a")!.getAttribute("data-bb-plugin")).toBe("tokenomics");
  });

  it("keeps a row's host across passes and restores bb's box once the goal is gone", () => {
    rows(["thr_a"]);
    const first = placeRowHosts(document, new Set(["thr_a"]), new Map());
    const second = placeRowHosts(document, new Set(["thr_a"]), first.hosts);
    expect(second.hosts.get("thr_a")).toBe(first.hosts.get("thr_a"));
    placeRowHosts(document, new Set(), second.hosts);
    expect(document.querySelectorAll(`[${ROW_HOST_ATTRIBUTE}]`)).toHaveLength(0);
    expect(document.getElementById("box-thr_a")!.hasAttribute(SLOT_ATTRIBUTE)).toBe(false);
  });
});

describe("keepsBbIcon", () => {
  it("leaves bb's icon showing beside the donut for a failure, a queued retry, or a state it doesn't know", () => {
    for (const [label, kept] of [
      ["Unread thread failed", true],
      ["Queued message failed to send", true],
      ["Thread has a message waiting to send", true],
      ["Provider rate limit reached", true],
      ["Thread working", false],
      ["Thread needs user input", false],
      [null, false],
    ] as const) {
      rows(["thr_a"], label ?? "");
      if (label === null) document.querySelector("svg")!.removeAttribute("aria-label");
      placeRowHosts(document, new Set(["thr_a"]), new Map(), keepsBbIcon);
      const box = document.getElementById("box-thr_a")!;
      expect([label, box.hasAttribute(SLOT_ATTRIBUTE)]).toEqual([label, !kept]);
      expect(box.nextElementSibling?.hasAttribute(ROW_HOST_ATTRIBUTE)).toBe(true);
    }
  });
});

describe("rowStateOf", () => {
  it("names bb's state from its icon's label", () => {
    expect(rowStateOf("Thread working")).toBe("runtime");
    expect(rowStateOf("Thread needs user input")).toBe("waiting-for-input");
    expect(rowStateOf(null)).toBe("none");
    expect(rowStateOf("Something new")).toBe("none");
  });
});

describe("onlyGoalHostChanges", () => {
  it("ignores changes inside the hosts it placed", async () => {
    rows(["thr_a"]);
    const { hosts } = placeRowHosts(document, new Set(["thr_a"]), new Map());
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

describe("withOpenCard", () => {
  it("shows an idle or finished thread with an open card as waiting, and leaves other states", async () => {
    const { withOpenCard } = await import("../components/row-activity.js");
    expect(withOpenCard("none", true)).toBe("waiting-for-input");
    expect(withOpenCard("unread-success", true)).toBe("waiting-for-input");
    expect(withOpenCard("runtime", true)).toBe("runtime");
    expect(withOpenCard("unread-error", true)).toBe("unread-error");
    expect(withOpenCard("draft", true)).toBe("draft");
    expect(withOpenCard("none", false)).toBe("none");
  });
});

describe("dashedSegment", () => {
  it("fills the segment with dashes and skips the rest of the ring", async () => {
    const { dashedSegment } = await import("../components/goal-line.js");
    const parts = dashedSegment(10, 40).split(" ").map(Number);
    // Dashes and spaces cover the segment exactly, and the last gap the rest.
    expect(parts.slice(0, -1).reduce((sum, part) => sum + part, 0)).toBeCloseTo(10, 1);
    expect(parts.at(-1)).toBeCloseTo(30, 1);
    expect(parts.length % 2).toBe(0);
  });
});
