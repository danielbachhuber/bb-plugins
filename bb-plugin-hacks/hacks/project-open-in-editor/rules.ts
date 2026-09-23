// Pure logic: which editor opens a project, and which folder it opens.
//
// No DOM and no network, so every decision about what the button does can be
// tested against plain objects.

/** One app the host daemon can open a path in, as `/workspace-open-targets` lists it. */
export interface OpenTarget {
  id: string;
  label: string;
  kind?: string;
  capabilities: { openDirectory: boolean };
}

/** One project, as bb's `/api/v1/projects` lists it. */
export interface Project {
  id: string;
  name: string;
  sources: readonly ProjectSource[];
}

export interface ProjectSource {
  type: string;
  hostId: string;
  path: string;
  isDefault: boolean;
}

/**
 * The editor to open a project folder in.
 *
 * bb's own directory preference wins when it names an editor, because that is
 * the app you already chose in bb's "Open in" menu. A preference for Finder or
 * a terminal is not an editor, so it falls through to the first editor the
 * daemon found rather than making this button open Finder.
 */
export function pickEditor(
  targets: readonly OpenTarget[],
  preferredId: string | null,
): OpenTarget | null {
  const editors = targets.filter(
    (target) => target.kind === "editor" && target.capabilities.openDirectory,
  );
  return (
    editors.find((target) => target.id === preferredId) ?? editors[0] ?? null
  );
}

/**
 * The project's checkout on this machine, or null when it has none here.
 *
 * A project can have a local path on several machines; only the one on the
 * machine running this window's host daemon can be opened from here. When a
 * machine somehow holds two, the default source wins.
 */
export function pickProjectPath(
  project: Project,
  hostId: string,
): string | null {
  const local = project.sources.filter(
    (source) => source.type === "local_path" && source.hostId === hostId,
  );
  return (local.find((source) => source.isDefault) ?? local[0])?.path ?? null;
}
