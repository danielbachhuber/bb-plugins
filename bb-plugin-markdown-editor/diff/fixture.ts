// The DOM bb's own GitDiffCardHeader renders, reproduced for the tests.
//
// This is the contract the diff-header content script depends on. When a bb
// upgrade moves the pencil or makes it disappear, this fixture is where that
// shows up: re-read
// `/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/
// bb-app/app/dist/assets/GitDiffCardHeader-*.js` and update the fixture and
// `diff/header.ts` together.
export interface CardOptions {
  /** The workspace-relative path, which bb puts in the path control's title. */
  path: string;
  /** The toggle's accessible name, which differs from `path` for a rename. */
  label?: string;
  stats?: string;
  collapsed?: boolean;
  /** Renders the card as a timeline diff instead of a changes-panel one. */
  timeline?: boolean;
  /** Renders bb's "nothing to expand" header, which has no aria-expanded. */
  inert?: boolean;
  /**
   * False renders the path as bb's plain truncated span rather than a button,
   * which is what bb does when the file has no preview to open.
   */
  openable?: boolean;
  /** False drops the copy and open-in-editor icons, as bb does for a file
   * with no openable path. */
  icons?: boolean;
}

/** bb's changes-panel toolbar, whose presence means the panel is open. */
export function renderToolbar(): void {
  const toolbar = document.createElement("div");
  toolbar.setAttribute("data-testid", "git-diff-toolbar-actions");
  document.body.append(toolbar);
}

export function renderCard(options: CardOptions): HTMLElement {
  const {
    path,
    label = path,
    stats = "+8 -4",
    collapsed = false,
    timeline = false,
    inert = false,
    openable = true,
    icons = true,
  } = options;
  const toggleAttrs = inert
    ? `aria-label="${label} has no changes to expand" disabled`
    : `aria-label="${collapsed ? "Expand" : "Collapse"} ${label}" aria-expanded="${!collapsed}"`;
  const pathControl = openable
    ? `<button type="button" class="min-w-0 text-left text-xs leading-5 font-mono font-medium text-foreground" title="${path}">${path}</button>`
    : `<span class="min-w-0 text-left text-xs leading-5" title="${path}">${path}</span>`;
  const iconControls = icons
    ? `<button type="button" aria-label="Copy path for ${label}" class="inline-flex size-5 cursor-pointer items-center justify-center rounded-md"></button>
       <button type="button" aria-label="Open ${label} in editor" class="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md"></button>`
    : "";
  const host = document.createElement("div");
  if (timeline) host.setAttribute("data-timeline-file-diff", "");
  host.innerHTML = `
    <div class="flex w-full min-w-0 items-center justify-between gap-2">
      <span class="flex min-w-0 items-center">
        <button type="button" class="inline-flex w-8 shrink-0" ${toggleAttrs}></button>
        <span class="flex min-w-0 items-center gap-1.5 pl-[1ch]">
          ${pathControl}
          ${iconControls}
        </span>
      </span>
      <span class="flex shrink-0 items-center gap-1">
        <span class="text-xs">${stats}</span>
      </span>
    </div>`;
  document.body.append(host);
  return host;
}
