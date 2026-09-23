// Reading bb's sidebar project headers, and adding the button to them.
//
// Every anchor here is something bb emits deliberately:
// `data-sidebar-project-id` on the project row, `data-sidebar-row-controls` on
// its hover controls, and the "New thread in <project>" label on the button
// this one sits beside.

/** Marks the button this hack adds, so a pass can find and remove its own. */
export const BUTTON_ATTR = "data-bb-hacks-open-in-editor";

export interface ProjectHeader {
  projectId: string;
  /** bb's "New thread in <project>" button, which the new button sits before. */
  newThread: HTMLButtonElement;
  /** This hack's button, when a pass has already added one. */
  button: HTMLButtonElement | null;
}

/**
 * Every project header in the sidebar that bb draws a New thread button for.
 *
 * A project row also contains environment group headers, each with its own
 * row controls and a "New thread in environment" button, so a header's
 * controls are the ones whose nearest project row is this one and whose New
 * thread button is labelled with this project's name. bb leaves the New thread
 * button out when the project's folder is missing, and so does this.
 */
export function findProjectHeaders(
  doc: Document,
  nameOf: (projectId: string) => string | null,
): ProjectHeader[] {
  const headers: ProjectHeader[] = [];
  for (const row of doc.querySelectorAll<HTMLElement>(
    "[data-sidebar-project-id]",
  )) {
    const projectId = row.getAttribute("data-sidebar-project-id");
    if (!projectId) continue;
    const name = nameOf(projectId);
    if (name === null) continue;
    for (const controls of row.querySelectorAll<HTMLElement>(
      "[data-sidebar-row-controls]",
    )) {
      if (controls.closest("[data-sidebar-project-id]") !== row) continue;
      const newThread = Array.from(
        controls.querySelectorAll<HTMLButtonElement>(":scope > button"),
      ).find(
        (button) => button.getAttribute("aria-label") === `New thread in ${name}`,
      );
      if (!newThread) continue;
      headers.push({
        projectId,
        newThread,
        button: controls.querySelector<HTMLButtonElement>(
          `:scope > button[${BUTTON_ATTR}]`,
        ),
      });
      break;
    }
  }
  return headers;
}

/** Lucide's `code-xml`, drawn the way bb draws its own sidebar icons. */
const ICON_PATHS = ["m18 16 4-4-4-4", "m6 8-4 4 4 4", "m14.5 4-5 16"];

/**
 * A button styled like bb's New thread button beside it.
 *
 * The classes are copied from that button rather than written down, so the
 * new one picks up bb's hover reveal, sizing, and coarse-pointer rules and
 * follows them when bb changes them.
 */
export function createButton(
  doc: Document,
  newThread: HTMLButtonElement,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.setAttribute(BUTTON_ATTR, "");
  button.className = newThread.className;
  setLabel(button, label);

  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  const sourceIcon = newThread.querySelector("svg");
  const iconClass = sourceIcon?.getAttribute("class");
  if (iconClass) svg.setAttribute("class", iconClass);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICON_PATHS) {
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  button.append(svg);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.detail > 0) button.blur();
    onClick();
  });
  return button;
}

export function setLabel(button: HTMLButtonElement, label: string): void {
  if (button.getAttribute("aria-label") === label) return;
  button.setAttribute("aria-label", label);
  button.title = label;
}
