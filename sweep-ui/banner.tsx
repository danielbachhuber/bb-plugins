// A one-line status under a row's title: red when something stops the work,
// green when it is ready to finish.
import type { ReactNode } from "react";

import { Icon } from "./icons";
import { cn } from "./lib/cn";

export type BannerTone = "blocked" | "ready";

const TONES = {
  blocked: { box: "bg-destructive/[0.07]", icon: "AlertCircle", text: "text-destructive-text" },
  ready: { box: "bg-success/[0.08]", icon: "CircleCheck", text: "text-success" },
} as const;

export interface StatusBannerProps {
  tone: BannerTone;
  /** The status in plain words: "Merge conflict with main", "Ready to merge". */
  children: ReactNode;
}

export function StatusBanner({ tone, children }: StatusBannerProps) {
  const { box, icon, text } = TONES[tone];
  return (
    <div data-tone={tone} className={cn("mt-1.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs", box)}>
      <Icon name={icon} className={cn("size-3.5 shrink-0", text)} />
      <span className={cn("min-w-0 font-medium", text)}>{children}</span>
    </div>
  );
}
