// The edit strip under a Todoist row: a date in words, a project, and a
// priority, held here and sent together on Save, so a new project or date
// cannot move the row away halfway through. Draws only.
import { useMemo, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Calendar03Icon from "@hugeicons/core-free-icons/Calendar03Icon";
import Flag02Icon from "@hugeicons/core-free-icons/Flag02Icon";
import HashIcon from "@hugeicons/core-free-icons/HashIcon";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { hasChanges, rowPriority, taskChanges, type TaskDraft } from "../todoist/edit.js";
import { shortDate } from "./sections.js";
import type { Item, TodoistProject } from "./types.js";

type Priority = TaskDraft["priority"];

/** Todoist's own flag colors, P1 to P4. */
const FLAG: Record<Priority, string> = {
  1: "text-[#d1453b]",
  2: "text-[#eb8909]",
  3: "text-[#246fe0]",
  4: "text-muted-foreground",
};

export function PriorityFlag({ priority, className }: { priority: Priority; className?: string }) {
  return <HugeiconsIcon icon={Flag02Icon} strokeWidth={1.8} className={cn("size-3.5", FLAG[priority], className)} />;
}

/** What the date box shows before anything is typed: the date as Todoist has it. */
function currentDate(item: Item, now: Date): string {
  if (item.due === null) return "No date";
  return item.due.text ?? shortDate(item.due.date, now);
}

function ProjectPicker({
  projects,
  value,
  fallback,
  onChange,
  disabled,
}: {
  /** Null while the list is loading, or when it could not be read. */
  projects: readonly TodoistProject[] | null;
  value: string | null;
  /** The row's own project name, shown until the list arrives. */
  fallback: string | null;
  onChange: (projectId: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = projects?.find((project) => project.id === value) ?? null;
  // While searching, the tree's nesting would mislead, so matches are drawn flat.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (projects ?? []).filter((project) => needle === "" || project.name.toLowerCase().includes(needle));
  }, [projects, query]);
  const searching = query.trim() !== "";

  const choose = (project: TodoistProject) => {
    onChange(project.id);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery("");
          setActive(Math.max(0, (projects ?? []).findIndex((project) => project.id === value)));
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled || projects === null}
          aria-label="Project"
          className="inline-flex h-7 w-36 min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-60"
        >
          <HugeiconsIcon icon={HashIcon} className="size-3 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-left">{selected?.name ?? fallback ?? "Project"}</span>
          <Icon name="ChevronDown" className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1" mobileTitle="Project">
        <Input
          autoFocus
          value={query}
          placeholder="Type a project name"
          aria-label="Find a project"
          className="h-8 text-sm"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, matches.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const match = matches[active];
              if (match !== undefined) choose(match);
            }
          }}
        />
        <div role="listbox" aria-label="Projects" className="mt-1 max-h-72 overflow-y-auto">
          {matches.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No project matches.</p>
          ) : (
            matches.map((project, index) => (
              <button
                key={project.id}
                type="button"
                role="option"
                aria-selected={project.id === value}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(project)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                  index === active && "bg-accent",
                )}
                style={{ paddingLeft: 8 + (searching ? 0 : project.depth) * 16 }}
              >
                <HugeiconsIcon icon={HashIcon} className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.id === value ? <Icon name="Check" className="size-3.5 shrink-0" /> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface TaskEditProps {
  item: Item;
  now: Date;
  projects: readonly TodoistProject[] | null;
  /** Resolves true once Todoist has it, so the strip can close. */
  onSave: (draft: TaskDraft) => Promise<boolean>;
  onDelete: () => void;
  onCancel: () => void;
  /** A save or delete is running. */
  busy: boolean;
}

export function TaskEdit({ item, now, projects, onSave, onDelete, onCancel, busy }: TaskEditProps) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({
    due: "",
    priority: rowPriority(item),
    projectId: item.todoist?.projectId ?? null,
  }));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const changed = hasChanges(taskChanges(item, draft));

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!changed || busy) return;
    void onSave(draft);
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) onCancel();
      }}
      aria-label={`Edit "${item.title}"`}
      className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-1.5"
    >
      <div className="relative w-40">
        <HugeiconsIcon
          icon={Calendar03Icon}
          className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={draft.due}
          onChange={(event) => setDraft({ ...draft, due: event.target.value })}
          placeholder={currentDate(item, now)}
          aria-label="Date"
          title='A date in words, as in Todoist: "fri", "next week", "every mon", or "no date"'
          disabled={busy}
          className="h-7 bg-background pl-7 text-xs"
        />
      </div>
      <ProjectPicker
        projects={projects}
        value={draft.projectId}
        fallback={item.context}
        disabled={busy}
        onChange={(projectId) => setDraft({ ...draft, projectId })}
      />
      <div className="flex" role="group" aria-label="Priority">
        {([1, 2, 3, 4] as const).map((priority) => (
          <button
            key={priority}
            type="button"
            aria-label={`P${priority}`}
            aria-pressed={draft.priority === priority}
            disabled={busy}
            onClick={() => setDraft({ ...draft, priority })}
            className={cn(
              "rounded-md border p-1 hover:bg-background",
              draft.priority === priority ? "border-border bg-background" : "border-transparent",
            )}
          >
            <PriorityFlag priority={priority} />
          </button>
        ))}
      </div>
      {confirmingDelete ? (
        <div className="ml-auto flex items-center gap-2" role="alert">
          <span className="text-xs text-muted-foreground">Delete for good? Todoist can't restore it.</span>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmingDelete(false)}>
            Keep
          </Button>
          <Button type="button" size="sm" variant="destructive" className="h-7 text-xs" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : (
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Delete"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="rounded p-1 text-muted-foreground hover:text-destructive-text disabled:opacity-50"
          >
            <Icon name="Trash2" className="size-3.5" />
          </button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={!changed || busy}>
            {busy ? <Icon name="Loading" className="size-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      )}
    </form>
  );
}
