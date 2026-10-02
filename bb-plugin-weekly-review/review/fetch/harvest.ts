import type { HarvestEntry } from "../types.js";
import type { Range } from "../dates.js";
import { runJson } from "./shell.js";

interface RawEntry {
  id?: number | string;
  spent_date?: string;
  hours?: number;
  notes?: string | null;
  task?: { name?: string };
}

export async function fetchHarvest(
  range: Range,
  config: { hrvst: string; harvestProjectId: string },
): Promise<HarvestEntry[]> {
  const projectArgs =
    config.harvestProjectId.trim() === ""
      ? []
      : ["--project_id", config.harvestProjectId.trim()];
  const raw = await runJson<RawEntry[] | { time_entries?: RawEntry[] }>(config.hrvst, [
    "time-entries", "list",
    "--from", range.from,
    "--to", range.to,
    ...projectArgs,
    "--per_page", "2000",
    "--page", "all",
    "--fields", "id,task.name,hours,notes,spent_date",
    // Without this the CLI prints a human-readable table.
    "--output", "json",
  ]);
  const list = Array.isArray(raw) ? raw : (raw.time_entries ?? []);
  return list
    .map((e) => ({
      // A string, because it is only ever used as a key.
      ...(e.id === undefined ? {} : { id: String(e.id) }),
      day: e.spent_date ?? "",
      task: e.task?.name ?? "Uncategorized",
      hours: Number(e.hours ?? 0),
      notes: (e.notes ?? "").trim(),
    }))
    .filter((e) => e.day);
}
