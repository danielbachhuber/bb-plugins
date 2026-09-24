// The Merge split button from GitHub Context's banner
// (bb-plugin-gh-context/components/context-banner.tsx), with its classes,
// which are bb's own prompt-banner action classes, so a row's merge looks and
// works the way the banner's does: the button merges with the method it
// names, and the menu beside it picks another method and merges with that.
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type MergeMethod = "merge" | "squash" | "rebase";

const ACTION_INTERACTIVE_CLASS =
  "cursor-pointer text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

export const MERGE_LABEL: Record<MergeMethod, string> = {
  merge: "Merge",
  squash: "Squash merge",
  rebase: "Rebase and merge",
};

/** The banner's default, when the repository allows it. */
function defaultMethod(methods: readonly MergeMethod[]): MergeMethod {
  return methods.includes("squash") ? "squash" : methods[0]!;
}

export function MergeSplitButton({
  methods,
  disabled,
  working,
  onMerge,
}: {
  /** The methods the repository allows, in the order the menu lists them. Not empty. */
  methods: readonly MergeMethod[];
  disabled: boolean;
  /** The merge is running: the button says so, with a spinner. */
  working: boolean;
  onMerge: (method: MergeMethod) => void;
}) {
  const [method, setMethod] = useState<MergeMethod>(() => defaultMethod(methods));
  const selected = methods.includes(method) ? method : defaultMethod(methods);
  const segment = cn("px-1.5 py-0.5 text-xs focus-visible:z-10", ACTION_INTERACTIVE_CLASS);
  return (
    <div className="inline-flex overflow-hidden rounded border border-border bg-background shadow-xs">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onMerge(selected)}
        className={cn(segment, "inline-flex items-center gap-1", working && "text-foreground")}
      >
        {working ? <Icon name="Loading" className="size-3 animate-spin" /> : null}
        {working ? "Merging…" : MERGE_LABEL[selected]}
      </button>
      {methods.length < 2 ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Choose pull request merge method"
              className={cn(
                segment,
                "inline-flex items-center border-l border-border px-1 data-[state=open]:bg-state-active data-[state=open]:text-foreground",
              )}
            >
              <Icon name="ChevronDown" className="size-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={2}>
            {methods.map((each) => (
              <DropdownMenuItem
                key={each}
                onSelect={() => {
                  setMethod(each);
                  onMerge(each);
                }}
              >
                {MERGE_LABEL[each]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
