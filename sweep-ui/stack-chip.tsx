// A pull request's place in a stack: pull requests built on each other's
// branches, which merge from the bottom up.
import type { ComponentType } from "react";

import { Icon } from "./icons";
import type { SweepLinkProps } from "./row";

export interface StackChipProps {
  stack: {
    /** 1 for the bottom of the stack. */
    index: number;
    size: number;
    /** The pull request this one is built on, or null at the bottom. */
    on: { number: number; url: string } | null;
  };
  /** Draws the link to the pull request below. Defaults to a plain anchor. */
  Link?: ComponentType<SweepLinkProps>;
}

function PlainAnchor({ href, className, onClick, children }: SweepLinkProps) {
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}

/** "3 of 5 · on #612", with the number linking to the pull request below, or "1 of 5 · base" at the bottom. */
export function StackChip({ stack, Link = PlainAnchor }: StackChipProps) {
  const { index, size, on } = stack;
  return (
    <span
      data-part="stack"
      title={on ? `Stacked on #${on.number}: merge that first` : "The bottom of a stack: the others build on it"}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-px text-[11px] leading-4 text-muted-foreground"
    >
      <Icon name="Layers" className="size-3" />
      {index} of {size} ·{" "}
      {on ? (
        <>
          on{" "}
          <Link href={on.url} className="hover:text-foreground hover:underline">
            #{on.number}
          </Link>
        </>
      ) : (
        "base"
      )}
    </span>
  );
}
