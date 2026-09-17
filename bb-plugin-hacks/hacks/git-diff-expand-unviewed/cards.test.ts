// @vitest-environment jsdom
//
// The fixture mirrors the DOM bb's GitDiffCardHeader renders. If a bb upgrade
// changes the card header, this is where it shows up first; re-read
// GitDiffCardHeader-*.js in bb's app/dist/assets and update the fixture and
// cards.ts together.
import { afterEach, describe, expect, it } from "vitest";
import { findCards, resolveCard, VIEWED_ATTR } from "./cards";

afterEach(() => {
  document.body.innerHTML = "";
});

function renderCard(
  path: string,
  options: {
    stats?: string;
    collapsed?: boolean;
    viewed?: boolean;
    withViewedCheckbox?: boolean;
  } = {},
): HTMLElement {
  const {
    stats = "+2 -2",
    collapsed = false,
    viewed = false,
    withViewedCheckbox = false,
  } = options;
  const host = document.createElement("div");
  host.innerHTML = `
    <div class="flex w-full min-w-0 items-center justify-between gap-2"${
      viewed ? ` ${VIEWED_ATTR}="true"` : ""
    }>
      <span class="flex min-w-0 items-center">
        <button type="button" aria-label="${collapsed ? "Expand" : "Collapse"} ${path}" aria-expanded="${!collapsed}"></button>
        <span><span class="font-mono">${path}</span></span>
      </span>
      <span class="flex shrink-0 items-center gap-1">${
        withViewedCheckbox
          ? `<label data-diff-viewed-owned=""><input type="checkbox"><span>Viewed</span></label>`
          : ""
      }<span>${stats}</span></span>
    </div>`;
  document.body.append(host);
  return host;
}

describe("findCards", () => {
  it("reads a card's path, stats, and collapse state", () => {
    renderCard("src/a.ts", { stats: "+8 -1", collapsed: true });
    expect(findCards(document)).toEqual([
      expect.objectContaining({
        path: "src/a.ts",
        stats: "+8 -1",
        isCollapsed: true,
        isViewed: false,
      }),
    ]);
  });

  it("reads the path from either label the collapse button carries", () => {
    renderCard("src/open.ts", { collapsed: false });
    expect(findCards(document)[0]?.path).toBe("src/open.ts");
  });

  it("reads diff-viewed's mark off the header row", () => {
    renderCard("src/read.ts", { viewed: true });
    expect(findCards(document)[0]?.isViewed).toBe(true);
  });

  it("keeps diff-viewed's checkbox out of the stats reading", () => {
    // Otherwise "Viewed" lands in the text the deletion test reads.
    renderCard("src/a.ts", { stats: "-40", withViewedCheckbox: true });
    expect(findCards(document)[0]?.stats).toBe("-40");
  });

  it("skips timeline diffs, which are a different file every message", () => {
    const host = renderCard("src/a.ts");
    const timeline = document.createElement("div");
    timeline.setAttribute("data-timeline-file-diff", "");
    timeline.append(host);
    document.body.append(timeline);
    expect(findCards(document)).toEqual([]);
  });

  it("returns every card on the page, in document order", () => {
    renderCard("src/a.ts");
    renderCard("src/b.ts");
    expect(findCards(document).map((card) => card.path)).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
  });
});

describe("resolveCard", () => {
  it("ignores a disclosure button that is not a diff card header", () => {
    const button = document.createElement("button");
    button.setAttribute("aria-expanded", "true");
    button.setAttribute("aria-label", "Collapse something");
    document.body.append(button);
    expect(resolveCard(button)).toBeNull();
  });

  it("ignores a button with nothing to expand", () => {
    const host = renderCard("src/a.ts");
    const toggle = host.querySelector("button") as HTMLButtonElement;
    toggle.removeAttribute("aria-expanded");
    expect(resolveCard(toggle)).toBeNull();
  });

  it("ignores a two-child row that is not laid out like a card header", () => {
    const host = renderCard("src/a.ts");
    host.querySelector(".justify-between")?.classList.remove("justify-between");
    const toggle = host.querySelector("button") as HTMLButtonElement;
    expect(resolveCard(toggle)).toBeNull();
  });

  it("returns null for a non-button element", () => {
    expect(resolveCard(document.createElement("div"))).toBeNull();
  });
});
