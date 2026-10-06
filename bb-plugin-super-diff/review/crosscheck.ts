// Super Diff's file list against bb's own, which bb's changes panel draws and
// which bb counts by its own code. Pure; server.ts asks bb for its list.

export interface CrossCheck {
  /** "agree" when both list the same paths; "differ" names what only one lists. */
  status: "agree" | "differ" | "unavailable";
  onlyBb: string[];
  onlyHere: string[];
  /** Why bb's list could not be compared, for "unavailable". */
  reason: string | null;
}

/** A nested repository is listed with a trailing slash by some git commands and without by others. */
const normal = (path: string) => path.replace(/\/$/, "");

/**
 * @param ours the paths Super Diff's diff lists
 * @param bb the paths bb lists, or why it gave none
 */
export function crossCheck(ours: string[], bb: string[] | { reason: string }): CrossCheck {
  if (!Array.isArray(bb)) return { status: "unavailable", onlyBb: [], onlyHere: [], reason: bb.reason };
  const here = new Set(ours.map(normal));
  const theirs = new Set(bb.map(normal));
  const onlyBb = [...theirs].filter((path) => !here.has(path)).sort();
  const onlyHere = [...here].filter((path) => !theirs.has(path)).sort();
  return { status: onlyBb.length || onlyHere.length ? "differ" : "agree", onlyBb, onlyHere, reason: null };
}
