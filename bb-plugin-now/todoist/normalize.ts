// Turn Todoist's task payloads into Now items. No I/O here.
import type { Due, Item, TodoistProject } from "../now/types.js";

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
  const text = typeof value.string === "string" && value.string !== "" ? value.string : undefined;
  return { date: value.date, recurring: value.is_recurring === true, ...(text === undefined ? {} : { text }) };
}

/**
 * Todoist's API counts priority up, 4 being what its app calls P1 and 1 being
 * no priority at all. Now counts down from 1.
 */
export function normalizePriority(value: unknown): Item["priority"] {
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
export function normalizeTask(raw: unknown, projects: ReadonlyMap<string, Project>): Item | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.content !== "string") return null;
  if (raw.checked === true || raw.is_deleted === true) return null;

  const project = typeof raw.project_id === "string" ? projects.get(raw.project_id) : undefined;

  return {
    id: `${SOURCE_ID}:${raw.id}`,
    source: SOURCE_ID,
    title: plainContent(raw.content),
    description: typeof raw.description === "string" ? raw.description : "",
    priority: normalizePriority(raw.priority),
    due: normalizeDue(raw.due),
    deadline: isRecord(raw.deadline) && typeof raw.deadline.date === "string" ? raw.deadline.date : null,
    activityAt: null,
    createdAt: typeof raw.added_at === "string" ? raw.added_at : null,
    context: project?.name ?? null,
    inbox: project?.inbox === true,
    tags: Array.isArray(raw.labels) ? raw.labels.filter((label) => typeof label === "string") : [],
    url: taskUrl(raw.id),
    gmail: null,
    github: null,
    todoist: { projectId: typeof raw.project_id === "string" ? raw.project_id : null, content: raw.content },
  };
}

export function normalizeTasks(raw: readonly unknown[], projects: ReadonlyMap<string, Project>): Item[] {
  return raw
    .map((task) => normalizeTask(task, projects))
    .filter((item): item is Item => item !== null);
}

export interface Project {
  name: string;
  /** Todoist's Inbox, where a task lands before it is sorted into a project. */
  inbox: boolean;
}

/** Project id to its name and whether it is the Inbox, from the projects endpoint's payload. */
export function projectMap(raw: readonly unknown[]): Map<string, Project> {
  const projects = new Map<string, Project>();
  for (const project of raw) {
    if (isRecord(project) && typeof project.id === "string" && typeof project.name === "string") {
      projects.set(project.id, { name: project.name, inbox: project.inbox_project === true });
    }
  }
  return projects;
}

/** Now's priority, with 4 for none, on Todoist's API scale. */
export function apiPriority(priority: 1 | 2 | 3 | 4): 1 | 2 | 3 | 4 {
  return (5 - priority) as 1 | 2 | 3 | 4;
}

/**
 * Every open project, each under its parent in Todoist's own order, the Inbox
 * first. A project whose parent is missing or archived is shown at the top.
 */
export function projectTree(raw: readonly unknown[]): TodoistProject[] {
  type Node = { id: string; name: string; parent: string | null; order: number; inbox: boolean };
  const nodes: Node[] = [];
  for (const project of raw) {
    if (!isRecord(project) || typeof project.id !== "string" || typeof project.name !== "string") continue;
    if (project.is_archived === true || project.is_deleted === true) continue;
    nodes.push({
      id: project.id,
      name: project.name,
      parent: typeof project.parent_id === "string" ? project.parent_id : null,
      order: typeof project.child_order === "number" ? project.child_order : 0,
      inbox: project.inbox_project === true,
    });
  }
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string | null, Node[]>();
  for (const node of nodes) {
    const parent = node.parent !== null && ids.has(node.parent) ? node.parent : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }

  const tree: TodoistProject[] = [];
  const visit = (parent: string | null, depth: number) => {
    const siblings = (children.get(parent) ?? []).sort((a, b) => Number(b.inbox) - Number(a.inbox) || a.order - b.order);
    for (const node of siblings) {
      tree.push({ id: node.id, name: node.name, depth, inbox: node.inbox });
      visit(node.id, depth + 1);
    }
  };
  visit(null, 0);
  return tree;
}
