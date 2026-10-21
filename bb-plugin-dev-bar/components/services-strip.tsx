import { useEffect, useState } from "react";
import type { Failure, RunTarget, StripAction, StripService } from "../services/contract";
import type { ServiceState, ServiceVerb } from "../services/manifest";
import { diagnose } from "../services/failure";
import { cn } from "../lib/utils";
import { ServicesDonut } from "./donut";
import { Glyph, glyphForLabel, type GlyphName } from "./glyph";
import { Icon } from "./ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** A key for one runnable thing, so the strip can mark it busy. */
export function targetKey(target: RunTarget): string {
  return target.kind === "service" ? `service:${target.id}` : `action:${target.index}`;
}

const DOT_CLASS: Record<ServiceState, string> = {
  running: "bg-success",
  starting: "bg-amber-500 animate-pulse",
  stopped: "border border-muted-foreground",
  failed: "bg-destructive",
};

const STATE_LABEL: Record<ServiceState, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  failed: "Failed",
};

const PILL_CLASS: Record<ServiceState, string> = {
  running: "bg-success/15 text-foreground",
  starting: "bg-amber-500/15 text-foreground",
  stopped: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive-text",
};

const VERB: Record<ServiceVerb, { label: string; glyph: GlyphName }> = {
  start: { label: "Start", glyph: "play" },
  stop: { label: "Stop", glyph: "stop" },
  restart: { label: "Restart", glyph: "restart" },
};

/** Lines the bar up under the thread, a little wider than the composer's column. */
const COLUMN_CLASS = "mx-auto w-full max-w-[1080px]";

/** Which verbs make sense for a service in its current state. */
function verbsFor(service: StripService): ServiceVerb[] {
  const offered: ServiceVerb[] =
    service.state === "stopped" || service.state === "failed" ? ["start", "restart"] : ["stop", "restart"];
  return service.verbs.filter((verb) => offered.includes(verb) && !(verb === "restart" && service.state === "stopped"));
}

/** `localhost:5173` from `http://localhost:5173/`, for a menu row. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function Spinner() {
  return <Icon name="Spinner" className="size-3 animate-spin text-muted-foreground" />;
}

function ServiceChip({
  service,
  busy,
  onRun,
  onOpen,
}: {
  service: StripService;
  busy: boolean;
  onRun: (verb: ServiceVerb) => void;
  onOpen: (url: string) => void;
}) {
  const verbs = verbsFor(service);
  const hint = [STATE_LABEL[service.state], service.url ? shortUrl(service.url) : null, service.message]
    .filter(Boolean)
    .join(" · ");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={hint}
          aria-label={`${service.label}: ${hint}`}
          className={cn(
            "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs",
            "hover:brightness-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "data-[state=open]:ring-1 data-[state=open]:ring-border",
            PILL_CLASS[service.state],
          )}
        >
          {busy ? <Spinner /> : <span className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[service.state])} />}
          {service.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {STATE_LABEL[service.state]}
          {service.message ? <div className="mt-0.5 max-w-64 whitespace-normal">{service.message}</div> : null}
        </div>
        {service.url ? (
          <DropdownMenuItem onSelect={() => onOpen(service.url!)} disabled={service.state !== "running"}>
            <Glyph name="external" className="size-3.5" />
            Open {shortUrl(service.url)}
          </DropdownMenuItem>
        ) : null}
        {service.url && verbs.length > 0 ? <DropdownMenuSeparator /> : null}
        {verbs.map((verb) => (
          <DropdownMenuItem key={verb} disabled={busy} onSelect={() => onRun(verb)}>
            <Glyph name={VERB[verb].glyph} className="size-3.5" />
            {VERB[verb].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A button whose command asks first: the first click arms it, the second runs it. */
function ActionButton({
  action,
  busy,
  primary,
  onRun,
}: {
  action: StripAction;
  busy: boolean;
  /** Filled, for the button the user most likely wants next. */
  primary: boolean;
  onRun: () => void;
}) {
  const glyph = glyphForLabel(action.label);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  // In a narrow bar, a button with an icon drops its label, unless it is the filled one or asking to confirm.
  const compact = glyph !== null && !primary && !armed;
  return (
    <button
      type="button"
      disabled={busy}
      title={armed ? undefined : (action.confirm ?? action.label)}
      aria-label={armed ? `${action.label}?` : action.label}
      onClick={() => {
        if (action.confirm && !armed) return setArmed(true);
        setArmed(false);
        onRun();
      }}
      className={cn(
        "inline-flex h-6 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 text-xs",
        compact && "@max-[760px]:w-6 @max-[760px]:px-0",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-60",
        armed
          ? "border border-destructive/40 bg-destructive/10 text-destructive-text hover:bg-destructive/15"
          : primary
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      {busy ? <Spinner /> : glyph ? <Glyph name={glyph} /> : null}
      <span className={cn(compact && "@max-[760px]:sr-only")}>{armed ? `${action.label}?` : action.label}</span>
    </button>
  );
}

function StartThreadButton({ label, primary, onClick }: { label: string; primary: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border bg-background text-foreground hover:bg-accent",
      )}
    >
      <Icon name="MessageSquarePlus" className="size-3.5" />
      {label}
    </button>
  );
}

function FailureNote({
  failure,
  onDismiss,
  onStartThread,
}: {
  failure: Failure;
  onDismiss: () => void;
  onStartThread: () => void;
}) {
  const diagnosis = diagnose(failure.output);
  const [showOutput, setShowOutput] = useState(false);
  const output = failure.output ? (
    <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-muted-foreground">
      {failure.output}
    </pre>
  ) : null;
  return (
    <div role="alert" className="mx-2 mb-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 py-0.5">
          {diagnosis ? (
            <>
              <span className="font-medium text-destructive-text">This checkout isn't set up for Dev Bar</span>
              <div className="mt-0.5 text-muted-foreground">
                <code className="font-mono text-foreground">{failure.command}</code> needs{" "}
                <code className="font-mono text-foreground">{diagnosis.program}</code>, which isn't installed here.
                Its dependencies may not be installed yet.
              </div>
            </>
          ) : (
            <>
              <span className="font-medium text-destructive-text">{failure.title} failed</span>
              {failure.command ? <code className="ml-2 font-mono text-muted-foreground">{failure.command}</code> : null}
            </>
          )}
        </div>
        <StartThreadButton
          label={diagnosis ? "Set up in a thread" : "Start thread"}
          primary={diagnosis !== null}
          onClick={onStartThread}
        />
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon name="X" className="size-3.5" />
        </button>
      </div>
      {diagnosis && failure.output ? (
        <>
          <button
            type="button"
            aria-expanded={showOutput}
            onClick={() => setShowOutput(!showOutput)}
            className="mt-1 inline-flex cursor-pointer items-center gap-0.5 rounded text-muted-foreground hover:text-foreground"
          >
            <Icon name="ChevronRight" className={cn("size-3 transition-transform", showOutput && "rotate-90")} />
            Output
          </button>
          {showOutput ? output : null}
        </>
      ) : (
        output
      )}
    </div>
  );
}

export interface ServicesStripProps {
  services: StripService[];
  actions: StripAction[];
  /** Null before the first status arrives. */
  loaded: boolean;
  /** Where the manifest came from, shown on hover over the count. */
  source: string | null;
  busy: ReadonlySet<string>;
  failure: Failure | null;
  onRun: (target: RunTarget) => void;
  onOpen: (url: string) => void;
  onDismissFailure: () => void;
  /** Starts a thread in this checkout to fix the failure. */
  onStartThread: (failure: Failure) => void;
  /** Runs the status command again, after it failed. */
  onRetry: () => void;
  retrying: boolean;
}

/** The status bar along the bottom of the thread pane: one item per service, then the repo's actions. */
export function ServicesStrip({
  services,
  actions,
  loaded,
  source,
  busy,
  failure,
  onRun,
  onOpen,
  onDismissFailure,
  onStartThread,
  onRetry,
  retrying,
}: ServicesStripProps) {
  const running = services.filter((service) => service.state === "running").length;
  // With nothing up, the first button that starts things is the likely next step.
  const primaryIndex =
    loaded && running === 0 ? actions.find((action) => glyphForLabel(action.label) === "play")?.index : undefined;
  return (
    <section aria-label="Dev Bar" className="@container border-t border-border bg-muted/40">
      {failure ? (
        <div className={cn(COLUMN_CLASS, "pt-1.5")}>
          <FailureNote failure={failure} onDismiss={onDismissFailure} onStartThread={() => onStartThread(failure)} />
        </div>
      ) : null}
      <div className={cn(COLUMN_CLASS, "flex h-9 items-center gap-1.5 px-3")}>
        {loaded && services.length === 0 ? (
          <span title={source ?? undefined} className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            Couldn't read services
            <button
              type="button"
              disabled={retrying}
              onClick={onRetry}
              className={cn(
                "inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border border-border bg-background px-2.5 text-foreground",
                "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
              )}
            >
              {retrying ? <Spinner /> : <Glyph name="restart" />}
              Retry
            </button>
          </span>
        ) : (
          loaded ? (
            <span
              role="img"
              aria-label={`${running} of ${services.length} running`}
              title={[`${running} of ${services.length} running`, source].filter(Boolean).join("\n")}
              className="inline-flex shrink-0 cursor-default items-center px-0.5"
            >
              <ServicesDonut states={services.map((service) => service.state)} />
            </span>
          ) : (
            <span className="shrink-0 cursor-default pr-1 text-xs font-medium text-muted-foreground">Reading services…</span>
          )
        )}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
          {services.map((service) => (
            <ServiceChip
              key={service.id}
              service={service}
              busy={busy.has(targetKey({ kind: "service", id: service.id, verb: "start" }))}
              onRun={(verb) => onRun({ kind: "service", id: service.id, verb })}
              onOpen={onOpen}
            />
          ))}
        </div>
        {actions.map((action) => (
          <ActionButton
            key={action.index}
            action={action}
            busy={busy.has(targetKey({ kind: "action", index: action.index }))}
            primary={action.index === primaryIndex}
            onRun={() => onRun({ kind: "action", index: action.index })}
          />
        ))}
      </div>
    </section>
  );
}
