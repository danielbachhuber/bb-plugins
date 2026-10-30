import { useEffect } from "react";

/** The badge bb draws on a page's entry in the sidebar and the rail: `ExperimentalBadge` from the plugin SDK. */
export type NavBadge = { count: number; tone: "neutral" | "warning" | "critical"; label: string };

/**
 * A page's badge in bb's navigation: the rows that need you most as a red
 * count, or else the rows that need you soon as an amber one, or else
 * nothing. The total is left out, so a badge always means something to do.
 * Pass `soonTone: "neutral"` for a second count that is not due, such as
 * rows with a thread working on them, so it shows grey instead of amber.
 * Its label, which bb puts in the tooltip and the accessible name, names
 * both counts when both are above zero.
 */
export function needsYouBadge({
  urgent,
  urgentLabel,
  soon = 0,
  soonLabel = "",
  soonTone = "warning",
}: {
  urgent: number;
  /** Such as "2 urgent". */
  urgentLabel: string;
  soon?: number;
  /** Such as "3 due today". */
  soonLabel?: string;
  soonTone?: "warning" | "neutral";
}): NavBadge | null {
  if (urgent > 0) {
    return { count: urgent, tone: "critical", label: soon > 0 ? `${urgentLabel}, ${soonLabel}` : urgentLabel };
  }
  if (soon > 0) return { count: soon, tone: soonTone, label: soonLabel };
  return null;
}

/**
 * The same red as `SidebarCount`'s circle (Tailwind's red-600), for every
 * critical badge in bb's navigation. bb draws the badge in its own
 * destructive red and scopes a plugin's stylesheet to the plugin's own
 * elements, so this goes in a style element in the document's head. bb marks
 * the badge with `data-nav-badge-tone` on both the rail and the sidebar list,
 * but not which page it belongs to, so bb's own critical badges turn this red
 * too. It also draws the amber badge's count in white, as every count in the
 * rail strip is, where bb draws it in dark ink.
 */
export const NAV_BADGE_RED_CSS = [
  '[data-nav-badge-tone="critical"] > span { background-color: oklch(57.7% 0.245 27.325); color: #fff; }',
  '[data-nav-badge-tone="warning"] > span { color: #fff; }',
].join("\n");

/**
 * Adds the red while the plugin runs: pass it to `app.contentScripts.register`.
 * Each plugin that registers it adds its own copy of the same rule.
 */
export const navBadgeRedContentScript = {
  id: "nav-badge-red",
  mount({ signal }: { signal: AbortSignal }) {
    const style = document.createElement("style");
    style.dataset.navBadgeRed = "";
    style.textContent = NAV_BADGE_RED_CSS;
    document.head.appendChild(style);
    const remove = () => style.remove();
    signal.addEventListener("abort", remove, { once: true });
    return remove;
  },
};


/** The two counts the rail strip draws: the urgent rows, and the rows due today or with a thread working on them. */
export type RailStrip = { urgent: number; second: number; secondTone: "today" | "working" };

const STRIP_RED = { bg: "oklch(57.7% 0.245 27.325)", fg: "#fff" };
const STRIP_AMBER = { bg: "var(--attention)", fg: "#fff" };
// The sweep pages' orange for rows with a thread working on them.
const STRIP_ORANGE = { bg: "#ea7a0c", fg: "#fff" };
const STRIP_ORANGE_DARK = "#f08a24";

/** Each half of the strip is 12 by 15 pixels, 1px inside the rail's right edge. */
const CELL_HEIGHT = 15;

/** A count of 10 or more is a 5px dot, drawn as a gradient so it sits in the middle of its cell. */
function cellFill(n: number, tone: { bg: string; fg: string }): string {
  if (n <= 9) return `content: "${n}"; background: ${tone.bg};`;
  const dot = `radial-gradient(circle, ${tone.fg} 2.5px, transparent 3px)`;
  return `content: ""; background: ${dot} center / 6px 6px no-repeat, ${tone.bg};`;
}

/**
 * The stylesheet that draws a page's two counts on bb's rail as a narrow
 * strip at the rail's right edge, centered on the icon: urgent in red on top,
 * the second count in amber (due today) or orange (working) below. Each count
 * is one character, a dot for 10 or more. The tooltip keeps the exact
 * numbers. bb's badge allows one count, so this hides bb's own mark on the
 * rail entry and draws the strip with the button's `::before` and `::after`.
 * The sidebar list keeps bb's badge. Returns "" when both counts are zero.
 */
export function railStripCss(itemId: string, { urgent, second, secondTone }: RailStrip): string {
  if (urgent <= 0 && second <= 0) return "";
  const entry = `[data-nav-rail-item="${itemId.replace(/["\\]/g, "\\$&")}"]`;
  const both = urgent > 0 && second > 0;
  const cell = [
    "position: absolute; pointer-events: none; z-index: 1;",
    "right: calc(1px - var(--bb-sidebar-rail-padding)); width: 12px;",
    `height: ${CELL_HEIGHT}px; box-sizing: border-box; padding-top: 1px;`,
    "display: flex; align-items: center; justify-content: center;",
    "font-size: var(--text-2xs); font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums;",
  ].join(" ");
  const top = both ? `top: calc(50% - ${CELL_HEIGHT}px); border-radius: 3px 3px 0 0;` : `top: calc(50% - ${CELL_HEIGHT / 2}px); border-radius: 3px;`;
  const bottom = both ? "top: 50%; border-radius: 0 0 3px 3px;" : top;
  const secondColor = secondTone === "today" ? STRIP_AMBER : STRIP_ORANGE;
  const rules = [`${entry} [data-nav-rail-badge] { display: none; }`];
  if (urgent > 0) rules.push(`${entry} button::before { ${cell} ${top} color: ${STRIP_RED.fg}; ${cellFill(urgent, STRIP_RED)} }`);
  if (second > 0) {
    rules.push(`${entry} button::after { ${cell} ${bottom} color: ${secondColor.fg}; ${cellFill(second, secondColor)} }`);
    if (secondTone === "working") {
      const dark = { bg: STRIP_ORANGE_DARK, fg: STRIP_ORANGE.fg };
      rules.push(`.dark ${entry} button::after { ${cellFill(second, dark)} }`);
    }
  }
  return rules.join("\n");
}

/**
 * Keeps a page's rail strip in a style element in the document's head while
 * the calling component is mounted. Call it from the page's
 * `experimental_useBadge` hook, which bb runs for as long as the plugin is
 * loaded. `itemId` is bb's id for the rail entry, `<plugin id>/<panel id>`.
 */
export function useRailStrip(itemId: string, strip: RailStrip | null): void {
  const css = strip ? railStripCss(itemId, strip) : "";
  useEffect(() => {
    if (!css) return;
    const style = document.createElement("style");
    style.dataset.railStrip = itemId;
    style.textContent = css;
    document.head.appendChild(style);
    return () => style.remove();
  }, [itemId, css]);
}
