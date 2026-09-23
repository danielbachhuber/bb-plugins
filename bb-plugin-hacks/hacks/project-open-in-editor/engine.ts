// The sync loop: keeps an "Open in editor" button on every project header that
// has a checkout on this machine.
//
// This lives outside app.tsx so it can be driven under jsdom, the same split
// the other hacks use and for the same reason: the wiring is where the bugs go.
import {
  pickEditor,
  pickProjectPath,
  type OpenTarget,
  type Project,
} from "./rules";
import {
  BUTTON_ATTR,
  createButton,
  findProjectHeaders,
  setLabel,
} from "./sidebar";

export interface Machine {
  hostId: string;
  targets: readonly OpenTarget[];
}

export interface EngineDeps {
  /** Aborted when the content script generation is torn down. */
  signal: AbortSignal;
  /** The document holding bb's sidebar. */
  doc: Document;
  /** Defer a pass. Returns a cancel function. `requestAnimationFrame` in bb. */
  defer: (run: () => void) => () => void;
  /** This machine's host id and editors, or null when no daemon is reachable. */
  loadMachine: () => Promise<Machine | null>;
  loadProjects: () => Promise<Project[]>;
  /** bb's stored directory "Open in" preference. */
  readPreferredTarget: () => string | null;
  open: (path: string, targetId: string) => Promise<void>;
  /** Where a failed load or open is reported. */
  warn: (message: string, error: unknown) => void;
}

export interface Engine {
  /** Run a pass now, skipping the scheduler. Tests use this. */
  syncNow: () => void;
  /** Resolves once the first load has settled. Tests use this. */
  ready: Promise<void>;
  dispose: () => void;
}

export function startEngine(deps: EngineDeps): Engine {
  const { signal, doc, defer } = deps;

  let machine: Machine | null = null;
  let projects = new Map<string, Project>();
  // The project rows with no matching header on the first pass after projects
  // were loaded, or null until that pass runs. A row for a project added or
  // renamed since then changes this, and is what triggers a reload; a row that
  // will never match (a project whose folder is missing) does not keep
  // reloading.
  let unmatchedAtLoad: string | null = null;
  let loading: Promise<void> | null = null;
  let writing = false;
  let cancel: (() => void) | null = null;

  function schedule(): void {
    if (signal.aborted || cancel !== null) return;
    cancel = defer(() => {
      cancel = null;
      syncNow();
    });
  }

  function reloadProjects(): void {
    if (loading !== null) return;
    loading = deps
      .loadProjects()
      .then((list) => {
        projects = new Map(list.map((project) => [project.id, project]));
      })
      .catch((error) => deps.warn("could not list projects", error))
      .finally(() => {
        unmatchedAtLoad = null;
        loading = null;
        schedule();
      });
  }

  function unmatchedRows(matched: ReadonlySet<string>): string {
    return Array.from(
      doc.querySelectorAll<HTMLElement>("[data-sidebar-project-id]"),
      (row) => row.getAttribute("data-sidebar-project-id") ?? "",
    )
      .filter((id) => id !== "" && !matched.has(id))
      .sort()
      .join(",");
  }

  function syncNow(): void {
    if (signal.aborted) return;
    const editor = machine
      ? pickEditor(machine.targets, deps.readPreferredTarget())
      : null;
    const headers = findProjectHeaders(
      doc,
      (id) => projects.get(id)?.name ?? null,
    );

    const keep = new Set<HTMLButtonElement>();
    writing = true;
    try {
      for (const header of headers) {
        const project = projects.get(header.projectId);
        const path =
          project && machine ? pickProjectPath(project, machine.hostId) : null;
        if (path === null || editor === null) continue;

        const label = `Open ${project!.name} in ${editor.label}`;
        let button = header.button;
        if (button === null) {
          const projectId = header.projectId;
          button = createButton(doc, header.newThread, label, () => {
            openProject(projectId);
          });
          header.newThread.before(button);
        } else {
          setLabel(button, label);
        }
        keep.add(button);
      }
      for (const button of doc.querySelectorAll<HTMLButtonElement>(
        `button[${BUTTON_ATTR}]`,
      )) {
        if (!keep.has(button)) button.remove();
      }
    } finally {
      writing = false;
    }

    if (machine === null) return;
    const unmatched = unmatchedRows(
      new Set(headers.map((header) => header.projectId)),
    );
    if (unmatchedAtLoad === null) {
      unmatchedAtLoad = unmatched;
    } else if (unmatched !== unmatchedAtLoad) {
      reloadProjects();
    }
  }

  function openProject(projectId: string): void {
    // Resolved again at click time, so a preference changed in bb's own
    // "Open in" menu since the last pass is the one that is used.
    const project = projects.get(projectId);
    const editor = machine
      ? pickEditor(machine.targets, deps.readPreferredTarget())
      : null;
    const path =
      project && machine ? pickProjectPath(project, machine.hostId) : null;
    if (path === null || editor === null) return;
    deps
      .open(path, editor.id)
      .catch((error) => deps.warn(`could not open ${path}`, error));
  }

  const ready = Promise.all([deps.loadMachine(), deps.loadProjects()])
    .then(([loadedMachine, list]) => {
      machine = loadedMachine;
      projects = new Map(list.map((project) => [project.id, project]));
    })
    .catch((error) => deps.warn("could not load projects or editors", error))
    .finally(schedule);

  const observer = new doc.defaultView!.MutationObserver(() => {
    if (writing) return;
    schedule();
  });
  observer.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-sidebar-project-id"],
  });

  return {
    syncNow,
    ready,
    dispose() {
      observer.disconnect();
      if (cancel !== null) cancel();
      cancel = null;
      for (const button of doc.querySelectorAll(`button[${BUTTON_ATTR}]`)) {
        button.remove();
      }
    },
  };
}
