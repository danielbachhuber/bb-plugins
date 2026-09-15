// Working out which thread a diff belongs to, and which file each rendered
// diff is showing.
//
// `threadIdFromPath` and `pathFromToggleLabel` are deliberate copies of the
// same functions in bb-plugin-diff-viewed. They are a few lines each and read
// bb's route and card label, which both plugins depend on identically; a
// shared package for that would cost more than it saves. If bb changes either
// shape, both plugins need the same edit.

/** Timeline diffs are out of scope: the same path recurs once per message
 * there, so a comment anchored to one could not mean anything useful. */
const TIMELINE_SELECTOR = "[data-timeline-file-diff]";

/**
 * The thread a diff belongs to, read from the app route. bb serves thread
 * pages at both `/threads/:id` and `/projects/:projectId/threads/:id`, so both
 * shapes have to resolve to the same id or comments would split across routes.
 */
export function threadIdFromPath(pathname: string): string | null {
  const match = /\/threads\/([^/?#]+)/.exec(pathname);
  const threadId = match?.[1];
  if (threadId === undefined || threadId === "") return null;
  return decodeURIComponent(threadId);
}

/**
 * bb labels a diff card's collapse control "Collapse <label>" or
 * "Expand <label>", and in the changes panel that label is the file path (or
 * `previous -> current` for a rename).
 */
export function pathFromToggleLabel(label: string | null): string | null {
  if (label === null) return null;
  const match = /^(?:Collapse|Expand) (.+)$/.exec(label);
  const path = match?.[1]?.trim();
  if (path === undefined || path === "") return null;
  return path;
}

/**
 * The file path for one rendered diff, found by walking up to the card that
 * holds it and reading bb's own collapse-control label.
 *
 * It walks up and stops at the FIRST ancestor containing a toggle. Cards are
 * siblings in the panel, so going any higher would find a neighbouring card's
 * label and attribute comments to the wrong file.
 */
export function pathForDiff(host: Element): string | null {
  if (host.closest(TIMELINE_SELECTOR) !== null) return null;

  let node: Element | null = host.parentElement;
  while (node !== null) {
    const toggle = node.querySelector("button[aria-expanded][aria-label]");
    if (toggle !== null) {
      return pathFromToggleLabel(toggle.getAttribute("aria-label"));
    }
    node = node.parentElement;
  }
  return null;
}
