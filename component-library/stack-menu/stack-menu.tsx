// A pull request's place in its stack on GitHub, "4/5" as GitHub writes it,
// opening a menu of every pull request in the stack. GitHub Context's banner
// and the sweeps' rows draw the same one.
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { GitMergeIcon, GitPullRequestArrow, GitPullRequestClosedIcon, Layers01Icon } from "@hugeicons/core-free-icons";
import { UrlLink } from "@get-bb/plugin-sdk/app";

import { cn } from "../lib/cn";

export type StackEntryState = "open" | "closed" | "merged";

export interface StackMenuStack {
  /** The stack's own number in its repository: "stack #N" on GitHub. */
  number: number;
  /** This pull request's place, 1 for the one closest to the base branch. */
  position: number;
  /** Every pull request in the stack, merged ones included. */
  size: number;
  /** Every pull request in the stack, bottom first. */
  entries: Array<{ number: number; title: string; url: string; state: StackEntryState }>;
}

export interface StackMenuProps {
  stack: StackMenuStack;
  /** The pull request the menu belongs to, marked "this PR" in the list. */
  current: number;
  /** Replaces the trigger's spacing and hover, for a caller with its own segment style. */
  className?: string;
  /** Opens the menu on first render, for a story. */
  defaultOpen?: boolean;
}

declare const __BB_PLUGIN_ID__: string | undefined;

/**
 * The attributes bb's own `usePortalScopeProps` puts on a portaled menu, so
 * the plugin's stylesheet still reaches it in `document.body`.
 */
function portalScope() {
  const pluginId = typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : undefined;
  return {
    "data-bb-portaled-overlay": "",
    "data-bb-plugin-root": "",
    ...(pluginId !== undefined ? { "data-bb-plugin": pluginId } : {}),
  };
}

const ENTRY_ICON: Record<StackEntryState, { icon: IconSvgElement; className: string }> = {
  open: { icon: GitPullRequestArrow, className: "text-success" },
  merged: { icon: GitMergeIcon, className: "text-pr-merged" },
  closed: { icon: GitPullRequestClosedIcon, className: "text-destructive" },
};

const TRIGGER_CLASS =
  "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-state-active data-[state=open]:text-foreground";

// bb's own menu classes, as the plugins' vendored `dropdown-menu.tsx` copies them.
const CONTENT_CLASS =
  "z-50 min-w-28 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2";
const ITEM_CLASS =
  "relative flex cursor-pointer select-none items-center rounded-sm p-0 text-xs outline-none focus:bg-state-hover focus:text-foreground active:bg-state-active";

/** "4/5" with a layers icon; the menu lists the stack top first, each with its title on hover. */
export function StackMenu({ stack, current, className, defaultOpen }: StackMenuProps) {
  const label = `Stack #${stack.number}: ${stack.position} of ${stack.size}`;
  return (
    <DropdownMenuPrimitive.Root defaultOpen={defaultOpen} modal={false}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button type="button" data-part="stack" aria-label={label} title={label} className={cn(TRIGGER_CLASS, className)}>
          <HugeiconsIcon icon={Layers01Icon} className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">
            {stack.position}/{stack.size}
          </span>
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content {...portalScope()} align="start" sideOffset={2} className={CONTENT_CLASS}>
          {[...stack.entries].reverse().map((entry) => {
            const icon = ENTRY_ICON[entry.state];
            const here = entry.number === current;
            return (
              <DropdownMenuPrimitive.Item key={entry.number} className={ITEM_CLASS}>
                <UrlLink
                  href={entry.url}
                  title={entry.title ? `#${entry.number} ${entry.title}` : undefined}
                  className={cn(
                    "flex w-full items-center gap-1.5 px-2 py-1.5 no-underline",
                    here ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  <HugeiconsIcon icon={icon.icon} className={cn("size-3.5 shrink-0", icon.className)} aria-hidden="true" />#
                  {entry.number}
                  {here ? <span className="font-normal text-muted-foreground">· this PR</span> : null}
                </UrlLink>
              </DropdownMenuPrimitive.Item>
            );
          })}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
