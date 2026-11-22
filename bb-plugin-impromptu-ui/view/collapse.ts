/**
 * Which views the user folded or unfolded by clicking their header, kept in
 * localStorage so the choice survives a switch to another thread and back,
 * which remounts the banner, and a reload.
 *
 * Each choice holds the publish it was made on and the items open then. An
 * unfolded view goes back to how it starts once it is published again. A
 * folded one stays folded through a republish unless the republish brings an
 * open item that was not open when it was folded.
 */
const KEY = "impromptu-ui:collapsed";
/** Choices kept, newest last; older ones are dropped. */
const LIMIT = 200;

type Choice = { stamp: string; collapsed: boolean; open: string[] };
type Choices = Record<string, Choice>;

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

/**
 * The user's choice for the view as published now, or undefined when they
 * made none, or made one the republish replaced.
 */
export function collapsedChoice(viewId: number, stamp: string, openItems: string[]): boolean | undefined {
  const choice = read()[viewId];
  if (choice === undefined) return undefined;
  if (choice.stamp === stamp) return choice.collapsed;
  if (!choice.collapsed) return undefined;
  const seen = new Set(choice.open ?? []);
  return openItems.every((id) => seen.has(id)) ? true : undefined;
}

export function rememberCollapsed(viewId: number, stamp: string, collapsed: boolean, openItems: string[]): void {
  const { [viewId]: _, ...rest } = read();
  const entries = [...Object.entries(rest), [String(viewId), { stamp, collapsed, open: openItems }] as const].slice(-LIMIT);
  storage()?.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
}
