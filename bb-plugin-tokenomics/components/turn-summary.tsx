// A turn's length, tokens, and commands: one muted line under each turn in
// the conversation, and a strip above the composer that counts up while a
// turn runs. Hovering or clicking either opens a card with the turn's whole
// breakdown. Display only: the caller loads the card's commands.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TurnSummary, TurnWork } from "@/usage/contract";
import { formatTokens } from "@/usage/series";

import { useHoverOpen } from "./hover-open";
import { formatSpan, TIME_PARTS } from "./thread-token-count";
import { KINDS } from "./turn-time-breakdown";

/** "0:42", "12:05", "1:02:05", for a running turn's clock. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}` : `${minutes}:${pad(seconds % 60)}`;
}

const total = (turn: TurnSummary) => turn.input + turn.cacheRead + turn.output;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** "5 commands, 3 tools", leaving out whichever is none. */
function workLabel(turn: TurnSummary): string | null {
  const parts = [
    turn.commands > 0 ? plural(turn.commands, "command") : null,
    turn.tools > 0 ? plural(turn.tools, "tool") : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(", ");
}

/** formatSpan, with "<1 sec" for a command that finished within a second. */
const commandSpan = (ms: number) => (ms < 500 ? "<1 sec" : formatSpan(ms));

const clockTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function share(part: number, all: number): string {
  if (all === 0) return "0%";
  const percent = (part / all) * 100;
  return percent > 0 && percent < 1 ? "<1%" : `${Math.round(percent)}%`;
}

function SplitBar({ split, className }: { split: NonNullable<TurnSummary["time"]>; className?: string }) {
  const all = Math.max(1, split.model + split.tools + split.waiting);
  return (
    <span className={cn("flex h-1.5 shrink-0 overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      {TIME_PARTS.map((part) =>
        split[part.key] > 0 ? (
          <span key={part.key} style={{ width: `${(split[part.key] / all) * 100}%`, background: part.color }} />
        ) : null,
      )}
    </span>
  );
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="flex items-baseline justify-between text-xs font-medium text-muted-foreground">
        <span>{title}</span>
        {aside === undefined ? null : <span className="tabular-nums">{aside}</span>}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, swatch }: { label: string; value: string; swatch?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {swatch === undefined ? null : <span className="size-2 shrink-0 rounded-sm" style={{ background: swatch }} />}
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

/** How many lines of a command the hover panel shows before it scrolls. */
const PANEL_LINES = 40;

/**
 * A command's row: its first line, and the whole command in a panel beside
 * the card while the pointer is on the row. The panel is portaled to the body,
 * since the card's popper positions it with a transform that would otherwise
 * contain a fixed element.
 */
function CommandRow({ command, ms, initiallyOpen = false }: { command: string; ms: number | null; initiallyOpen?: boolean }) {
  const [at, setAt] = useState<{ left: number; right: number; top: number; bottom: number } | null>(null);
  const row = useRef<HTMLDivElement>(null);
  const first = command.split("\n")[0]!.trim();
  const whole = command.trim();
  const show = () => {
    // Read once, on the pointer arriving, not on render.
    const rect = row.current?.getBoundingClientRect();
    const card = row.current?.closest("[data-radix-popper-content-wrapper]")?.getBoundingClientRect();
    if (rect === undefined) return;
    setAt({ left: (card ?? rect).left, right: (card ?? rect).right, top: rect.top, bottom: rect.bottom });
  };
  useEffect(() => {
    if (!initiallyOpen) return;
    // After the card has been placed, so the panel measures where it ends up.
    const timer = setTimeout(show, 300);
    return () => clearTimeout(timer);
  }, [initiallyOpen]);
  const value = ms === null ? "running" : commandSpan(ms);
  const panelWidth = 520;
  const roomRight = at !== null && at.right + 8 + panelWidth <= window.innerWidth;
  return (
    <div
      ref={row}
      className={cn("-mx-1.5 flex items-center gap-2 rounded px-1.5 text-xs hover:bg-muted", at !== null && "bg-muted")}
      onPointerEnter={show}
      onPointerLeave={() => setAt(null)}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{first}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
      {at === null || (whole === first && whole.length <= 48)
        ? null
        : createPortal(
            <pre
              role="tooltip"
              className="pointer-events-none fixed z-[60] overflow-hidden whitespace-pre-wrap break-all rounded-md border border-border bg-popover p-3 font-mono text-[11px] leading-relaxed text-popover-foreground shadow-md"
              style={{
                width: panelWidth,
                // Lined up with the row, growing away from the nearer edge of the window.
                ...(at.top < window.innerHeight / 2
                  ? { top: Math.max(8, at.top - 12) }
                  : { bottom: Math.max(8, window.innerHeight - at.bottom - 12) }),
                maxHeight: Math.min(PANEL_LINES * 18, window.innerHeight - 16),
                ...(roomRight ? { left: at.right + 8 } : { left: Math.max(8, at.left - 8 - panelWidth) }),
              }}
            >
              {whole}
            </pre>,
            document.body,
          )}
    </div>
  );
}

export interface TurnCardProps {
  turn: TurnSummary;
  running: boolean;
  now: number;
  /** Null while it loads. */
  work: TurnWork | null;
  /** Show this command in full on first render, for stories. */
  openCommand?: number;
}

/** The card a turn's line or strip opens: its time, tokens, and what it ran. */
export function TurnCard({ turn, running, now, work, openCommand }: TurnCardProps) {
  const end = turn.endedAt ?? (running ? now : null);
  const tokens = total(turn);
  const time = turn.time;
  const timeAll = time === null ? 0 : time.model + time.tools + time.waiting;
  const others = work?.kinds.filter((kind) => kind.kind !== "commandExecution") ?? [];
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{running ? "This turn" : "Turn"}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {clockTime(turn.startedAt)}
          {turn.endedAt === null ? "" : ` to ${clockTime(turn.endedAt)}`}
          {end === null ? "" : ` · ${running ? formatClock(end - turn.startedAt) : formatSpan(end - turn.startedAt)}`}
        </span>
      </header>

      {time === null ? null : (
        <Section title="Time" aside={formatSpan(timeAll)}>
          <SplitBar split={time} className="w-full" />
          {TIME_PARTS.filter((part) => time[part.key] > 0).map((part) => (
            <Row
              key={part.key}
              label={part.label}
              swatch={part.color}
              value={`${formatSpan(time[part.key])} · ${share(time[part.key], timeAll)}`}
            />
          ))}
        </Section>
      )}

      <Section title="Tokens" aside={running && tokens === 0 ? undefined : formatTokens(tokens)}>
        {running && tokens === 0 ? (
          <p className="text-xs text-muted-foreground">The provider reports a turn's tokens when it ends.</p>
        ) : (
          <>
            <Row label="New input" value={formatTokens(turn.input)} />
            <Row label="Cache reads" value={`${formatTokens(turn.cacheRead)} · ${share(turn.cacheRead, tokens)}`} />
            <Row label="Output" value={formatTokens(turn.output)} />
          </>
        )}
      </Section>

      {turn.commands === 0 ? null : (
        <Section title="Commands" aside={turn.commands.toLocaleString()}>
          {work === null ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <>
              {work.commands.map((command, index) => (
                <CommandRow
                  key={index}
                  command={command.command}
                  ms={command.ms}
                  initiallyOpen={index === openCommand}
                />
              ))}
              {work.moreCommands === 0 ? null : (
                <p className="text-xs text-muted-foreground">and {plural(work.moreCommands, "faster one")}</p>
              )}
            </>
          )}
        </Section>
      )}

      {others.length === 0 ? null : (
        <Section title="Other tools" aside={turn.tools.toLocaleString()}>
          {others.map((kind) => {
            const known = KINDS[kind.kind];
            return (
              <Row
                key={kind.kind}
                label={known?.label ?? kind.kind}
                value={`${kind.count.toLocaleString()} ${kind.count === 1 ? (known?.one ?? "call") : (known?.many ?? "calls")}${kind.ms >= 1_000 ? ` · ${formatSpan(kind.ms)}` : ""}`}
              />
            );
          })}
        </Section>
      )}
    </div>
  );
}

interface TurnPopoverProps {
  turn: TurnSummary;
  running: boolean;
  now: number;
  work: TurnWork | null;
  /** Called when the card opens, to load its commands. */
  onOpen?: () => void;
  /** Open on first render, for stories. */
  defaultOpen?: boolean;
  align: "start" | "end";
  side: "top" | "bottom";
  triggerClassName?: string;
  openCommand?: number;
  children: ReactNode;
}

/** Opens the card when the pointer rests on its trigger, or on a click, and keeps it open while the pointer is on the card. */
function TurnPopover({
  turn,
  running,
  now,
  work,
  onOpen,
  defaultOpen = false,
  align,
  side,
  triggerClassName,
  openCommand,
  children,
}: TurnPopoverProps) {
  const { open, onOpenChange, hover } = useHoverOpen({ defaultOpen, onOpen });
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button type="button" className={cn("min-w-0 cursor-pointer text-left", triggerClassName)} {...hover}>
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-[360px] p-4"
        onOpenAutoFocus={(event) => event.preventDefault()}
        {...hover}
      >
        <TurnCard turn={turn} running={running} now={now} work={work} openCommand={openCommand} />
      </PopoverContent>
    </Popover>
  );
}

export interface TurnSummaryLineProps {
  turn: TurnSummary;
  work?: TurnWork | null;
  onOpen?: () => void;
  defaultOpen?: boolean;
  /** Show this command in full on first render, for stories. */
  openCommand?: number;
}

/** The line under a finished turn: "2 min · 1.8M tokens · 5 commands, 3 tools". */
export function TurnSummaryLine({ turn, work = null, onOpen, defaultOpen, openCommand }: TurnSummaryLineProps) {
  const parts = [
    turn.endedAt === null ? null : formatSpan(turn.endedAt - turn.startedAt),
    `${formatTokens(total(turn))} tokens`,
    workLabel(turn),
  ].filter((part) => part !== null);
  return (
    <div className="flex px-2 pt-1 pb-2">
      <TurnPopover
        turn={turn}
        running={false}
        now={turn.endedAt ?? turn.startedAt}
        work={work}
        onOpen={onOpen}
        defaultOpen={defaultOpen}
        openCommand={openCommand}
        align="start"
        side="bottom"
      >
        <span className="flex items-center gap-2 rounded-sm text-xs tabular-nums text-muted-foreground/70 transition-colors hover:text-foreground">
          {turn.time === null ? null : <SplitBar split={turn.time} className="w-10" />}
          <span>{parts.join(" · ")}</span>
        </span>
      </TurnPopover>
    </div>
  );
}

export interface TurnStripProps {
  turn: TurnSummary;
  /** The turn is still running, so its clock counts up from `now`. */
  running: boolean;
  now: number;
  work?: TurnWork | null;
  onOpen?: () => void;
  defaultOpen?: boolean;
}

/** The strip above the composer while a turn runs. Once it ends, the line under the turn takes over. */
export function TurnStrip({ turn, running, now, work = null, onOpen, defaultOpen }: TurnStripProps) {
  const elapsed = running ? now - turn.startedAt : turn.endedAt === null ? null : turn.endedAt - turn.startedAt;
  const work_ = workLabel(turn);
  const noTokensYet = running && total(turn) === 0;
  return (
    <div
      role="status"
      aria-live="off"
      className="rounded-lg border border-border bg-card text-xs tabular-nums"
      // Below the context meter, which takes order -1.
      style={{ order: 0 }}
    >
      <TurnPopover
        turn={turn}
        running={running}
        now={now}
        work={work}
        onOpen={onOpen}
        defaultOpen={defaultOpen}
        align="start"
        side="top"
        triggerClassName="w-full"
      >
        <span className="flex w-full items-center gap-3 px-3 py-1.5">
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            <span
              className={cn("size-1.5 rounded-full", running ? "animate-pulse" : "bg-muted-foreground/40")}
              style={running ? { background: TIME_PARTS[0].color } : undefined}
              aria-hidden
            />
            {running ? "This turn" : "Last turn"}
          </span>
          {elapsed === null ? null : (
            <span className="font-medium">{running ? formatClock(elapsed) : formatSpan(elapsed)}</span>
          )}
          {/* Providers report a turn's tokens when it ends, so a running turn has none yet. */}
          {noTokensYet ? null : (
            <span>
              <span className="font-medium">{formatTokens(total(turn))}</span>
              <span className="text-muted-foreground"> tokens</span>
            </span>
          )}
          {work_ === null ? null : <span className="text-muted-foreground">{work_}</span>}
          <span className="flex-1" />
          {noTokensYet ? <span className="text-muted-foreground">Tokens when it ends</span> : null}
          {!running && turn.time !== null ? <SplitBar split={turn.time} className="w-10" /> : null}
        </span>
      </TurnPopover>
    </div>
  );
}
