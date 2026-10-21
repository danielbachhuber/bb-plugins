import { useEffect, useState } from "react";
import type { Failure, RunTarget, StripAction, StripService } from "../services/contract";
import type { ServiceState, ServiceVerb } from "../services/manifest";
import { cn } from "../lib/utils";
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

const VERB: Record<ServiceVerb, { label: string; icon: string }> = {
  start: { label: "Start", icon: "Play" },
  stop: { label: "Stop", icon: "Square" },
  restart: { label: "Restart", icon: "RotateCw" },
};

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
  return <Icon name="LoaderCircle" className="size-3 animate-spin text-muted-foreground" />;
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
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded px-1.5 text-xs text-foreground",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent",
            service.state === "failed" && "text-destructive-text",
          )}
        >
          {busy ? <Spinner /> : <span className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[service.state])} />}
          <span className={cn(service.state === "stopped" && "text-muted-foreground")}>{service.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {STATE_LABEL[service.state]}
          {service.message ? <div className="mt-0.5 max-w-64 whitespace-normal">{service.message}</div> : null}
        </div>
        {service.url ? (
          <DropdownMenuItem onSelect={() => onOpen(service.url!)} disabled={service.state !== "running"}>
            <Icon name="ExternalLink" className="size-3.5" />
            Open {shortUrl(service.url)}
          </DropdownMenuItem>
        ) : null}
        {service.url && verbs.length > 0 ? <DropdownMenuSeparator /> : null}
        {verbs.map((verb) => (
          <DropdownMenuItem key={verb} disabled={busy} onSelect={() => onRun(verb)}>
            <Icon name={VERB[verb].icon} className="size-3.5" />
            {VERB[verb].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A button whose command asks first: the first click arms it, the second runs it. */
function ActionButton({ action, busy, onRun }: { action: StripAction; busy: boolean; onRun: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <button
      type="button"
      disabled={busy}
      title={armed ? undefined : (action.confirm ?? undefined)}
      onClick={() => {
        if (action.confirm && !armed) return setArmed(true);
        setArmed(false);
        onRun();
      }}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground",
        "hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-60",
        armed && "bg-destructive/10 text-destructive-text hover:bg-destructive/15 hover:text-destructive-text",
      )}
    >
      {busy ? <Spinner /> : null}
      {armed ? `${action.label}?` : action.label}
    </button>
  );
}

function FailureNote({ failure, onDismiss }: { failure: Failure; onDismiss: () => void }) {
  return (
    <div role="alert" className="mx-2 mb-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-medium text-destructive-text">{failure.title} failed</span>
          {failure.command ? <code className="ml-2 font-mono text-muted-foreground">{failure.command}</code> : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="-m-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Icon name="X" className="size-3.5" />
        </button>
      </div>
      {failure.output ? (
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4 text-muted-foreground">
          {failure.output}
        </pre>
      ) : null}
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
}: ServicesStripProps) {
  const running = services.filter((service) => service.state === "running").length;
  return (
    <section aria-label="Dev Bar" className="border-t border-border bg-muted/40">
      {failure ? (
        <div className="pt-1.5">
          <FailureNote failure={failure} onDismiss={onDismissFailure} />
        </div>
      ) : null}
      <div className="flex h-7 items-center gap-1 px-2">
        <span title={source ?? undefined} className="shrink-0 cursor-default px-1.5 text-xs text-muted-foreground">
          {!loaded ? "Dev services…" : services.length > 0 ? `${running}/${services.length} running` : "Dev services"}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
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
            onRun={() => onRun({ kind: "action", index: action.index })}
          />
        ))}
      </div>
    </section>
  );
}
