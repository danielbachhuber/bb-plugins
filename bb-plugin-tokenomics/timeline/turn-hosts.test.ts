// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { HOST_ATTRIBUTE, placeTurnHosts } from "./turn-hosts.js";

function render(ids: string[]): void {
  document.body.innerHTML = ids.map((id) => `<div data-timeline-row-id="${id}"><div>row</div></div>`).join("");
}

const row = (id: string) => document.querySelector(`[data-timeline-row-id="${id}"]`)!;

const T1_END = "thr_w:command:i12";
const T2_END = "thr_w:assistant:kind:assistant|turn:t2|parent:root|item:i21";
const IDS = [
  "thr_w:user-seed:1",
  "thr_w:assistant:kind:assistant|turn:t1|parent:root|item:i11",
  T1_END,
  "thr_w:user-seed:40",
  T2_END,
  "thr_other:assistant:kind:assistant|turn:t9|parent:root|item:i1",
];

describe("placeTurnHosts", () => {
  beforeEach(() => render(IDS));

  it("puts a host at the end of each turn's last row", () => {
    const hosts = placeTurnHosts(document, "thr_w", new Set(["t1", "t2"]), new Map());
    expect(row(T1_END).lastElementChild).toBe(hosts.get("t1"));
    expect(row(T2_END).lastElementChild).toBe(hosts.get("t2"));
    expect(document.querySelectorAll(`[${HOST_ATTRIBUTE}]`)).toHaveLength(2);
  });

  it("skips turns it has no summary for, and other threads' rows", () => {
    const hosts = placeTurnHosts(document, "thr_w", new Set(["t2", "t9"]), new Map());
    expect([...hosts.keys()]).toEqual(["t2"]);
  });

  it("keeps a turn's host when bb re-renders its row", () => {
    const first = placeTurnHosts(document, "thr_w", new Set(["t1"]), new Map());
    render(IDS);
    const second = placeTurnHosts(document, "thr_w", new Set(["t1"]), first);
    expect(second.get("t1")).toBe(first.get("t1"));
    expect(row(T1_END).lastElementChild).toBe(first.get("t1"));
  });

  it("moves the host when the turn gains a row, and removes hosts no longer wanted", () => {
    const first = placeTurnHosts(document, "thr_w", new Set(["t1", "t2"]), new Map());
    row(T1_END).insertAdjacentHTML("afterend", '<div data-timeline-row-id="thr_w:tool:i13"></div>');
    const second = placeTurnHosts(document, "thr_w", new Set(["t1"]), first);
    expect(row("thr_w:tool:i13").lastElementChild).toBe(first.get("t1"));
    expect(second.has("t2")).toBe(false);
    expect(first.get("t2")!.isConnected).toBe(false);
  });
});
