// What the palette shows, as data.
//
// bb collects a plugin's palette rows once per app interpretation: `setup` is
// synchronous, and the host memoizes the collected registrations. So the rows
// cannot be fetched while the palette is open — they are built from the
// snapshot the plugin already holds, and app.tsx turns each descriptor here
// into a registration. Keeping it a pure function is also the only way to test
// the titles, since the frontend test harness does not capture palette
// registrations.
import type { AutomationSummary } from "./automations";

/** One palette row, before it becomes a `commandPaletteAction`. */
export interface PaletteRow {
  /** Unique within the plugin; bb requires letters, digits, `-`, `_`. */
  id: string;
  /** What the palette matches the query against, so it says both verbs. */
  title: string;
  /** The automation to run, and the project the run is queued in. */
  automationId: string;
  projectId: string;
}

/**
 * The row's label.
 *
 * "Run automation:" rather than "Run:" so that typing either "run" or
 * "automation" finds it next to bb's own commands, and the project after the
 * name so that typing a project name finds its automations. The palette
 * matches the query against this whole string.
 */
function rowTitle(automation: AutomationSummary): string {
  const project = automation.projectName.length > 0 ? ` · ${automation.projectName}` : "";
  return `Run automation: ${automation.name}${project}${automation.enabled ? "" : " (paused)"}`;
}

/**
 * A row per automation, ordered by name.
 *
 * Every automation is listed in every project's palette. It runs in its own
 * project either way, and hiding the row outside that project put the one
 * automation worth reaching — a scheduled sweep — out of reach from whichever
 * window you were already in.
 *
 * The order matters a little: the host owns matching and recency, but an
 * unqueried palette lists rows as registered, and alphabetical is the only
 * order that does not shuffle when a run count or next-run time changes.
 */
export function paletteRows(automations: readonly AutomationSummary[]): PaletteRow[] {
  return [...automations]
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    .map((automation) => ({
      id: `run-${automation.id}`,
      title: rowTitle(automation),
      automationId: automation.id,
      projectId: automation.projectId,
    }));
}
