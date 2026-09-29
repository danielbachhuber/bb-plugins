import { Fragment, type ReactNode } from "react";

import { Icon } from "./icons";
import { cn } from "./lib/cn";
import { NoteBox, NoteField } from "./note";
import { Track } from "./track";
import type { Flag, Stage, SweepItem, Tier } from "./types";

const BLUE_TEXT = "text-[#0b57d0] dark:text-[#a8c7fa]";
const BLUE_DOT = "bg-[#0b57d0] dark:bg-[#a8c7fa]";

/** Rows with a flag are tinted the way Now tints them: red for stale, slate for blocked. */
function tint(item: SweepItem): string | false {
  if (item.flags.some((flag) => flag.kind === "stale"))
    return "-mx-4 border-l-2 border-l-destructive bg-destructive/[0.04] pl-[14px] pr-4";
  if (item.flags.some((flag) => flag.kind === "blocked"))
    return "-mx-4 border-l-2 border-l-slate-400 bg-slate-500/[0.05] pl-[14px] pr-4";
  return false;
}

function FlagText({ flag }: { flag: Flag }) {
  if (flag.kind === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
        <Icon name="Lock" className="size-3" />
        {flag.text}
      </span>
    );
  }
  return <span className="font-medium text-destructive-text">{flag.text}</span>;
}

function ParentChip({ parent }: { parent: NonNullable<SweepItem["parent"]> }) {
  return (
    <a
      href={parent.url}
      target="_blank"
      rel="noreferrer"
      title={`#${parent.number} ${parent.title}`}
      className="inline-flex max-w-[14rem] items-center gap-1 rounded border border-border px-1 text-[11px] leading-4 text-muted-foreground hover:text-foreground"
    >
      <Icon name="Layers" className="size-3 shrink-0" />
      <span className="truncate">{parent.title}</span>
    </a>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted-foreground/15">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
          style={{ width: `${total === 0 ? 0 : (done / total) * 100}%` }}
        />
      </span>
      {done}/{total}
    </span>
  );
}

/** `#123`, the flags, the facts, "N new", and the parent chip, joined by dots. */
function NumberLine({ item }: { item: SweepItem }) {
  const parts: ReactNode[] = [
    ...item.flags.map((flag) => <FlagText flag={flag} />),
    ...item.facts.map((fact) => <span>{fact}</span>),
  ];
  if (item.newComments > 0) {
    parts.push(<span className={cn("font-medium", BLUE_TEXT)}>{item.newComments} new</span>);
  }
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
      <span>#{item.number}</span>
      {parts.map((part, index) => (
        <Fragment key={index}>
          <span aria-hidden="true">·</span>
          {part}
        </Fragment>
      ))}
      {item.parent ? <ParentChip parent={item.parent} /> : null}
    </div>
  );
}

function Chevron({ open, small, onToggle }: { open: boolean; small: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={open ? "Collapse" : "Expand"}
      onClick={onToggle}
      className="-m-1 inline-flex shrink-0 items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon name={open ? "ChevronDown" : "ChevronRight"} className={small ? "size-3" : "size-3.5"} />
    </button>
  );
}

export interface SweepRowProps {
  item: SweepItem;
  tier: Tier;
  open: boolean;
  onToggle: () => void;
  stages: Stage[];
  onMove?: (stage: number) => void;
  onOpenLink?: () => void;
  /** The plugin's own actions, drawn before the note button. */
  actions: ReactNode;
  editing: boolean;
  onEditNote: () => void;
  onNoteSave: (body: string) => Promise<boolean>;
  onNoteCancel: () => void;
  /** Dimmed while a request for this row runs. */
  busy?: boolean;
}

export function SweepRow({
  item,
  tier,
  open,
  onToggle,
  stages,
  onMove,
  onOpenLink,
  actions,
  editing,
  onEditNote,
  onNoteSave,
  onNoteCancel,
  busy = false,
}: SweepRowProps) {
  const line = tier === "later" && !open;
  const unread = item.newComments > 0;
  const track = <Track stages={stages} stage={item.stage} offTrack={item.offTrack} onMove={onMove} />;
  const iconColumn = (
    <div className={cn("flex w-5 shrink-0 flex-col items-center gap-1.5", !line && "pt-0.5")}>
      <Chevron open={open} small={line} onToggle={onToggle} />
      {unread ? <span className={cn("size-1.5 rounded-full", BLUE_DOT)} aria-label="New" /> : null}
    </div>
  );
  const title = (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      onClick={onOpenLink}
      className={cn("truncate hover:underline", line ? "text-muted-foreground" : "text-foreground", unread && "font-semibold")}
    >
      {item.title}
    </a>
  );

  if (line) {
    return (
      <li className={cn("flex items-center gap-3 py-2 text-sm", tint(item), busy && "opacity-50")}>
        {iconColumn}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {title}
            <span className="shrink-0 text-xs text-muted-foreground">#{item.number}</span>
          </span>
          {item.facts[0] ? <span className="ml-auto shrink-0 text-xs text-muted-foreground">{item.facts[0]}</span> : null}
        </div>
        {track}
      </li>
    );
  }
  return (
    <li className={cn("flex gap-3 text-sm", open ? "py-3" : "py-2.5", tint(item), busy && "opacity-50")}>
      {iconColumn}
      <div className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">{title}</span>
        <NumberLine item={item} />
        {open ? (
          <>
            {editing ? (
              <NoteField initial={item.note ?? ""} onSave={onNoteSave} onCancel={onNoteCancel} />
            ) : (
              <NoteBox note={item.note} />
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {actions}
              <button
                type="button"
                onClick={onEditNote}
                className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground"
              >
                <Icon name="Edit" className="size-3" />
                {item.note === null ? "Add note" : "Edit note"}
              </button>
              {item.progress ? <Progress {...item.progress} /> : null}
            </div>
          </>
        ) : null}
      </div>
      {track}
    </li>
  );
}
