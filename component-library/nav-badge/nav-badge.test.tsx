// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NAV_BADGE_RED_CSS, navBadgeRedContentScript, needsYouBadge, railStripCss, useRailStrip, type RailStrip } from "./nav-badge";

describe("needsYouBadge", () => {
  it("counts the urgent rows in red, naming both counts", () => {
    expect(needsYouBadge({ urgent: 15, urgentLabel: "15 urgent", soon: 24, soonLabel: "24 due today" })).toEqual({
      count: 15,
      tone: "critical",
      label: "15 urgent, 24 due today",
    });
  });

  it("counts the rows due soon in amber when none are urgent", () => {
    expect(needsYouBadge({ urgent: 0, urgentLabel: "0 urgent", soon: 2, soonLabel: "2 due today" })).toEqual({
      count: 2,
      tone: "warning",
      label: "2 due today",
    });
  });

  it("draws nothing when nothing needs you", () => {
    expect(needsYouBadge({ urgent: 0, urgentLabel: "0 urgent" })).toBeNull();
  });
});

describe("navBadgeRedContentScript", () => {
  it("adds the red to the document's head until the plugin stops", () => {
    const controller = new AbortController();
    navBadgeRedContentScript.mount({ signal: controller.signal });
    expect(document.head.querySelector("style[data-nav-badge-red]")?.textContent).toBe(NAV_BADGE_RED_CSS);
    controller.abort();
    expect(document.head.querySelector("style[data-nav-badge-red]")).toBeNull();
  });
});

describe("railStripCss", () => {
  it("draws urgent over the second count and hides bb's own rail badge", () => {
    const css = railStripCss("now/now", { urgent: 4, second: 2, secondTone: "today" });
    expect(css).toContain('[data-nav-rail-item="now/now"] [data-nav-rail-badge] { display: none; }');
    expect(css).toMatch(/button::before \{[^}]*top: calc\(50% - 15px\)[^}]*content: "4"/);
    expect(css).toMatch(/button::after \{[^}]*top: 50%;[^}]*content: "2"; background: var\(--attention\)/);
  });

  it("centers a lone count on the icon", () => {
    const css = railStripCss("pr-sweep/prs", { urgent: 0, second: 2, secondTone: "working" });
    expect(css).not.toContain("::before");
    expect(css).toMatch(/button::after \{[^}]*top: calc\(50% - 7.5px\); border-radius: 3px;/);
  });

  it("draws 10 or more as a dot rather than two characters", () => {
    const css = railStripCss("now/now", { urgent: 12, second: 0, secondTone: "today" });
    expect(css).toContain('content: "";');
    expect(css).toContain("radial-gradient(circle, #fff 2.5px, transparent 3px) center / 6px 6px no-repeat");
    expect(css).not.toContain('"12"');
  });

  it("draws nothing when both counts are zero", () => {
    expect(railStripCss("now/now", { urgent: 0, second: 0, secondTone: "today" })).toBe("");
  });
});

describe("useRailStrip", () => {
  afterEach(cleanup);

  function Strip({ strip }: { strip: RailStrip | null }) {
    useRailStrip("now/now", strip);
    return null;
  }

  it("keeps one style element in the head, updated with the counts and removed on unmount", () => {
    const { rerender, unmount } = render(<Strip strip={{ urgent: 1, second: 0, secondTone: "today" }} />);
    rerender(<Strip strip={{ urgent: 3, second: 0, secondTone: "today" }} />);
    const styles = document.head.querySelectorAll('style[data-rail-strip="now/now"]');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('content: "3"');
    unmount();
    expect(document.head.querySelector("style[data-rail-strip]")).toBeNull();
  });
});
