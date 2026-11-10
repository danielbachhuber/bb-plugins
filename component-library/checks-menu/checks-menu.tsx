// A pull request's checks badge, made clickable: the menu lists every check on
// the head commit, failing ones first, each opening its details page. The
// sweeps' rows draw it around their checks count.
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  MinusSignCircleIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { UrlLink } from "@get-bb/plugin-sdk/app";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type CheckOutcome = "fail" | "cancelled" | "pending" | "pass" | "skip";

export interface CheckEntry {
  name: string;
  /** The Actions workflow the check belongs to, when it has one. */
  workflow?: string;
  outcome: CheckOutcome;
  /** The check's details page on GitHub or the CI provider. */
  url?: string;
}

export interface ChecksMenuProps {
  checks: CheckEntry[];
  /** What the trigger draws, usually the checks count. */
  children: ReactNode;
  /** The trigger's accessible name, such as "1 fail, 6 pass". */
  label: string;
  className?: string;
  /** Opens the menu on first render, for a story. */
  defaultOpen?: boolean;
}

declare const __BB_PLUGIN_ID__: string | undefined;

/** The attributes bb puts on a portaled menu, so the plugin's stylesheet still reaches it. */
function portalScope() {
  const pluginId = typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : undefined;
  return {
    "data-bb-portaled-overlay": "",
    "data-bb-plugin-root": "",
    ...(pluginId !== undefined ? { "data-bb-plugin": pluginId } : {}),
  };
}

const OUTCOME: Record<CheckOutcome, { icon: IconSvgElement; className: string; label: string }> = {
  fail: { icon: CancelCircleIcon, className: "text-destructive-text", label: "failing" },
  cancelled: { icon: StopCircleIcon, className: "text-destructive-text", label: "cancelled" },
  pending: { icon: Clock01Icon, className: "text-amber-600/70 dark:text-amber-500/70", label: "running" },
  pass: { icon: CheckmarkCircle02Icon, className: "text-success", label: "passed" },
  skip: { icon: MinusSignCircleIcon, className: "text-muted-foreground", label: "skipped" },
};

const ORDER: CheckOutcome[] = ["fail", "cancelled", "pending", "pass", "skip"];

/** Failing first, then cancelled, running, passed, and skipped, each by name. */
export function sortChecks(checks: readonly CheckEntry[]): CheckEntry[] {
  return [...checks].sort(
    (a, b) => ORDER.indexOf(a.outcome) - ORDER.indexOf(b.outcome) || a.name.localeCompare(b.name),
  );
}

const TRIGGER_CLASS =
  "-mx-1 inline-flex shrink-0 cursor-pointer items-center rounded px-1 py-0.5 transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-state-active";

// bb's own menu classes, as Stack menu uses them, with a height cap for long lists.
const CONTENT_CLASS =
  "z-50 max-h-80 min-w-48 max-w-96 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2";
const ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center rounded-sm p-0 text-xs outline-none focus:bg-state-hover focus:text-foreground active:bg-state-active";

/**
 * The trigger wraps `children`; the menu lists every check, failing first.
 * With no checks to list, `children` is drawn alone, not as a button.
 */
export function ChecksMenu({ checks, children, label, className, defaultOpen }: ChecksMenuProps) {
  if (checks.length === 0) return <>{children}</>;
  return (
    <DropdownMenuPrimitive.Root defaultOpen={defaultOpen} modal={false}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button type="button" data-part="checks-menu" aria-label={`Checks: ${label}`} title={label} className={cn(TRIGGER_CLASS, className)}>
          {children}
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content {...portalScope()} align="start" sideOffset={2} className={CONTENT_CLASS}>
          {sortChecks(checks).map((check, index) => {
            const outcome = OUTCOME[check.outcome];
            const title = `${check.workflow ? `${check.workflow} / ` : ""}${check.name} ${outcome.label}`;
            const body = (
              <>
                <HugeiconsIcon icon={outcome.icon} className={cn("size-3.5 shrink-0", outcome.className)} aria-label={outcome.label} />
                <span className="min-w-0 truncate">
                  {check.workflow ? <span className="text-muted-foreground">{check.workflow} / </span> : null}
                  <span className="text-foreground">{check.name}</span>
                </span>
              </>
            );
            const rowClass = "flex w-full items-center gap-1.5 px-2 py-1.5 no-underline";
            return (
              <DropdownMenuPrimitive.Item key={`${check.name}-${index}`} className={ITEM_CLASS} disabled={!check.url}>
                {check.url ? (
                  <UrlLink href={check.url} title={title} className={rowClass}>
                    {body}
                  </UrlLink>
                ) : (
                  <span title={title} className={rowClass}>
                    {body}
                  </span>
                )}
              </DropdownMenuPrimitive.Item>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
