// Turn Todoist's task payloads into Now items. No I/O here.
import type { Due, Item } from "../now/types.js";

type Raw = Record<string, unknown>;

export const SOURCE_ID = "todoist";

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Todoist task titles are Markdown. The list shows them as plain text, so
 * links keep their text and emphasis markers go.
 */
export function plainContent(markdown: string): string {
  return markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]*)`/g, "$1")
    .trim();
}

function normalizeDue(value: unknown): Due | null {
  if (!isRecord(value) || typeof value.date !== "string") return null;
  return { date: value.date, recurring: value.is_recurring === true };
}

/**
 * Todoist's API counts priority up, 4 being what its app calls P1 and 1 being
 * no priority at all. Now counts down from 1.
 */
function normalizePriority(value: unknown): Item["priority"] {
  if (value === 4) return 1;
  if (value === 3) return 2;
  if (value === 2) return 3;
  return null;
}

/** The task page in Todoist's web app. The v1 API does not return one. */
export function taskUrl(id: string): string {
  return `https://app.todoist.com/app/task/${encodeURIComponent(id)}`;
}

/** One task, or null when the payload lacks what a row needs. */
export function normalizeTask(raw: unknown, projectNames: ReadonlyMap<string, string>): Item | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.content !== "string") return null;
  if (raw.checked === true || raw.is_deleted === true) return null;

  const projectId = typeof raw.project_id === "string" ? raw.project_id : null;

  return {
    id: `${SOURCE_ID}:${raw.id}`,
    source: SOURCE_ID,
    title: plainContent(raw.content),
    description: typeof raw.description === "string" ? raw.description : "",
    priority: normalizePriority(raw.priority),
    due: normalizeDue(raw.due),
    deadline: isRecord(raw.deadline) && typeof raw.deadline.date === "string" ? raw.deadline.date : null,
    activityAt: null,
    context: projectId === null ? null : (projectNames.get(projectId) ?? null),
    tags: Array.isArray(raw.labels) ? raw.labels.filter((label) => typeof label === "string") : [],
    url: taskUrl(raw.id),
  };
}

export function normalizeTasks(raw: readonly unknown[], projectNames: ReadonlyMap<string, string>): Item[] {
  return raw
    .map((task) => normalizeTask(task, projectNames))
    .filter((item): item is Item => item !== null);
}

/** Project id to name, from the projects endpoint's payload. */
export function projectNameMap(raw: readonly unknown[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const project of raw) {
    if (isRecord(project) && typeof project.id === "string" && typeof project.name === "string") {
      names.set(project.id, project.name);
    }
  }
  return names;
}
