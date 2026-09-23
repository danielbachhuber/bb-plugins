/**
 * Hides bb's own prompt context banner where gh-context's is drawn.
 *
 * A content script, because styling bb's app shell is what the SDK sanctions
 * content scripts for. It cannot read plugin settings, so the setting lives in
 * the banner instead: gh-context's banner carries `data-gh-context-hide` while
 * `hideDefaultBanner` is on, and this rule only applies inside a prompt box
 * that contains it. Two consequences, both on purpose: a pane whose banner has
 * not mounted, or has crashed, keeps bb's; and two panes side by side each
 * decide for themselves.
 *
 * The accessible labels are the only stable handles bb's banner has, so the
 * test beside this file checks them against bb's source.
 */

export const id = "hide-default-banner";

export const BB_BANNER_LABELS = ["Thread context before sending", "Child threads"] as const;

const BB_BANNER_SELECTOR = BB_BANNER_LABELS.map((label) => `section[aria-label="${label}"]`).join(", ");

export const HIDE_SELECTOR = `[data-promptbox-shell]:has([data-gh-context-hide]) :is(${BB_BANNER_SELECTOR})`;

export const HIDE_CSS = `${HIDE_SELECTOR} { display: none !important; }`;

export function mount(signal: AbortSignal, doc: Document = document): () => void {
  const style = doc.createElement("style");
  style.dataset.ghContext = id;
  style.textContent = HIDE_CSS;
  doc.head.appendChild(style);
  const remove = () => style.remove();
  signal.addEventListener("abort", remove, { once: true });
  return remove;
}
