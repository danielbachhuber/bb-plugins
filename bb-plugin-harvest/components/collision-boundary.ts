/**
 * The pane a popover should stay inside.
 *
 * Radix keeps a popover inside the viewport, but in bb the trigger often sits
 * in one pane beside another, such as the thread beside a split pane or the
 * secondary panel. A popover that fits the window can still run past its own
 * pane and disappear under the next one. Passing that pane as the collision
 * boundary makes Radix shift or flip the popover so it stays inside it.
 *
 * The pane is the nearest ancestor that clips its content and is narrower than
 * the window. Small clipping wrappers, such as a row that scrolls sideways,
 * are skipped by requiring a minimum height, so the popover is not squeezed
 * into a single row.
 */
export const MIN_BOUNDARY_HEIGHT = 200;

export function paneBoundary(trigger: Element | null): Element | null {
  if (!trigger) return null;
  const view = trigger.ownerDocument.defaultView;
  if (!view) return null;
  for (
    let el = trigger.parentElement;
    el && el !== trigger.ownerDocument.body;
    el = el.parentElement
  ) {
    const style = view.getComputedStyle(el);
    const clips = style.overflowX !== "visible" || style.overflowY !== "visible";
    if (!clips) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < MIN_BOUNDARY_HEIGHT) continue;
    if (rect.width >= view.innerWidth - 1) return null;
    return el;
  }
  return null;
}
