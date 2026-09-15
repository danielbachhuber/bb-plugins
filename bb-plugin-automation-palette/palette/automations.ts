// The shape of an automation as this plugin carries it, and the parsers that
// turn `bb`'s JSON into it.
//
// Everything here is a pure function of a string or a value already in hand: no
// process, no storage, no clock. The CLI boundary lives in palette/cli.ts and
// the browser boundary in app.tsx, so this file is the part that can be tested
// against real `bb automation list --json` output without either.

/** One automation, reduced to what a palette row needs. */
export interface AutomationSummary {
  /** `auto_...`; also the palette row's id, so it must stay slot-id safe. */
  id: string;
  /** The project the automation runs in, which is where the run is queued. */
  projectId: string;
  name: string;
  /**
   * The project's display name, carried so the row can say it.
   *
   * Every automation is listed in every project's palette: a scheduled sweep
   * is worth reaching from whatever window you are in, and a row's title is
   * fixed at registration, so naming the project in the title is the only way
   * to tell two projects' automations apart. Empty when the CLI reported no
   * name for the project.
   */
  projectName: string;
  /** A paused automation still gets a row: running one by hand is the point. */
  enabled: boolean;
}

/** bb's slot-id rule, which a palette row id has to satisfy. */
const SLOT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * A row's title is one line in a list, so a name with a newline in it would
 * break the palette's layout rather than the plugin. Collapsed, then capped.
 */
const MAX_NAME_LENGTH = 80;

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  const collapsed = value.replace(/\s+/gu, " ").trim();
  return collapsed.length > MAX_NAME_LENGTH
    ? `${collapsed.slice(0, MAX_NAME_LENGTH - 1)}…`
    : collapsed;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * One entry of `bb automation list --project <id> --json`, or nothing.
 *
 * Tolerant on purpose: the CLI reports the whole automation (trigger,
 * execution, run counts) and adds fields over time, and an entry this plugin
 * cannot read should cost that one row rather than the whole list.
 */
export function toAutomationSummary(value: unknown): AutomationSummary | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  const id = nonEmptyString(raw.id);
  const projectId = nonEmptyString(raw.projectId);
  if (id === null || projectId === null) return null;
  if (!SLOT_ID_PATTERN.test(id)) return null;

  const name = cleanName(raw.name);
  return {
    id,
    projectId,
    // A nameless automation is still runnable, and its id is what the
    // Automations page would show, so the row says that rather than nothing.
    name: name.length > 0 ? name : id,
    // `bb automation list` does not report the project's name, so the server
    // attaches it; the persisted snapshot carries it back.
    projectName: cleanName(raw.projectName),
    enabled: raw.enabled !== false,
  };
}

/**
 * Parse a list of automations out of JSON text, dropping anything unreadable.
 *
 * Used for both `bb`'s stdout and the browser's persisted snapshot: neither is
 * trusted, and both are the same shape by the time they get here.
 */
export function parseAutomations(json: string): AutomationSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const summaries: AutomationSummary[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    const summary = toAutomationSummary(entry);
    if (summary === null || seen.has(summary.id)) continue;
    seen.add(summary.id);
    summaries.push(summary);
  }
  return summaries;
}

/** One project, as much of it as a row title needs. */
export interface ProjectSummary {
  id: string;
  /** Empty when the CLI reported no usable name. */
  name: string;
}

/** Projects out of `bb project list --json`, in the order it reported them. */
export function parseProjects(json: string): ProjectSummary[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const projects: ProjectSummary[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const id = nonEmptyString(raw.id);
    if (id === null || projects.some((project) => project.id === id)) continue;
    projects.push({ id, name: cleanName(raw.name) });
  }
  return projects;
}
