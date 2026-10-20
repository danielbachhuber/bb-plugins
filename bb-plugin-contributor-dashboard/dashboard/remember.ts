// The chosen span, kept across opens. A preset is one click to get back, but
// a range someone picked by hand is not, and the page is remounted every time
// bb navigates away from it.
import { DEFAULT_SELECTION, type Selection } from "./period.js";

const KEY = "contributor-dashboard:selection";

export function rememberedSelection(): Selection {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_SELECTION;
    const value = JSON.parse(raw) as Selection;
    if (value.kind === "preset" && typeof value.id === "string") return value;
    if (value.kind === "custom" && Number.isFinite(value.from) && Number.isFinite(value.to)) return value;
  } catch {
    // A browser with storage switched off, or something else's key. The
    // default is always right enough to carry on with.
  }
  return DEFAULT_SELECTION;
}

export function rememberSelection(selection: Selection): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(selection));
  } catch {
    // Not worth failing a render over.
  }
}

const SCREEN_KEY = "contributor-dashboard:screen";

/**
 * The screen last shown, as its sub-path ("" for the dashboard itself), so
 * opening the page from the sidebar returns to a person or stage rather than
 * always to the top.
 */
export function rememberedScreen(): string {
  try {
    return window.localStorage.getItem(SCREEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberScreen(subPath: string): void {
  try {
    window.localStorage.setItem(SCREEN_KEY, subPath);
  } catch {
    // Not worth failing a render over.
  }
}
