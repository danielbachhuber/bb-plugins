// The screen last shown, kept across opens. bb remounts the panel every time
// it is opened from elsewhere, which always arrives at the list, so without
// this a milestone someone was reading is lost on every click away.

const KEY = "milestone-sweep:screen";

/** The sub-path last shown, "" for the list. */
export function rememberedScreen(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    // A browser with storage switched off. The list is fine to start on.
    return "";
  }
}

export function rememberScreen(subPath: string): void {
  try {
    window.localStorage.setItem(KEY, subPath);
  } catch {
    // Not worth failing a render over.
  }
}
