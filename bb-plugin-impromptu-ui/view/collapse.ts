/**
 * Which views the user folded or unfolded by clicking their header, kept in
 * localStorage so the choice survives a switch to another thread and back,
 * which remounts the banner, and a reload.
 *
 * Each choice holds the publish it was made on. A republish is a new
 * publish, so the view goes back to how it starts (expanded while anything is
 * open).
 */
const KEY = "impromptu-ui:collapsed";
/** Choices kept, newest last; older ones are dropped. */
const LIMIT = 200;

type Choices = Record<string, { stamp: string; collapsed: boolean }>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(): Choices {
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(KEY) ?? "{}");
    return parsed !== null && typeof parsed === "object" ? (parsed as Choices) : {};
  } catch {
    return {};
  }
}

/** The user's choice for this publish of the view, or undefined when they made none. */
export function collapsedChoice(viewId: number, stamp: string): boolean | undefined {
  const choice = read()[viewId];
  return choice?.stamp === stamp ? choice.collapsed : undefined;
}

export function rememberCollapsed(viewId: number, stamp: string, collapsed: boolean): void {
  const { [viewId]: _, ...rest } = read();
  const entries = [...Object.entries(rest), [String(viewId), { stamp, collapsed }] as const].slice(-LIMIT);
  storage()?.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
}
