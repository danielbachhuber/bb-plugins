// A pull request's place in a stack on GitHub, which merges from the base
// branch up.
import type { ComponentType } from "react";

import { Icon } from "./icons";
import type { SweepLinkProps } from "./row";

export interface StackChipProps {
  stack: {
    /** 1 for the pull request closest to the base branch. */
    index: number;
    /** Every pull request in the stack, merged ones included. */
    size: number;
    /** The open pull request directly below, or null when that one has merged or there is none. */
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

/** "4/5" as GitHub writes it, then "· on #612" linking to the open pull request below, when there is one. */
export function StackChip({ stack, Link = PlainAnchor }: StackChipProps) {
  const { index, size, on } = stack;
  return (
    <span
      data-part="stack"
      title={`${index} of ${size} in a stack${on ? `, stacked on #${on.number}: merge that first` : ""}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-1.5 py-px text-[11px] leading-4 text-muted-foreground"
    >
      <Icon name="Layers" className="size-3" />
      <span className="tabular-nums">
        {index}/{size}
      </span>
      {on ? (
        <>
          {" "}
          · on{" "}
          <Link href={on.url} className="hover:text-foreground hover:underline">
            #{on.number}
          </Link>
        </>
      ) : null}
    </span>
  );
}
