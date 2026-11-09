// The action-line pieces every sweep draws the same way.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { Icon } from "./icons";

/** A row action's look, matching the list's own "Add note" button. */
export const LINE_ACTION =
  "-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-60";

/** How long "Copied" stays up before the label returns. */
const COPIED_MS = 1500;

export interface CopyLinkActionProps {
  /** The link text: "Widget hinge squeaks (#12)". */
  text: string;
  url: string;
  /**
   * The plugin's own clipboard writer, such as its `writeLinkToClipboard`.
   * Resolves true once something was copied.
   */
  write: (text: string, url: string) => Promise<boolean>;
}

/** Copies the title and link, labelled like the row's other actions. */
export function CopyLinkAction({ text, url, write }: CopyLinkActionProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A sweep can unmount the row mid-tick.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    if (!(await write(text, url))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }, [text, url, write]);

  return (
    <button type="button" className={LINE_ACTION} onClick={() => void onCopy()}>
      <Icon name={copied ? "Check" : "Copy"} className="size-3" />
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

/**
 * A row's actions drawn as icons alone, for a one-line row with no room for
 * labels. Each button keeps its label for screen readers, at no width, and
 * shows it on hover, so the plugins pass the same action buttons as for a
 * full row.
 */
export function IconActions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    for (const button of ref.current?.querySelectorAll("button") ?? []) {
      const label = button.textContent?.trim();
      if (label && !button.title) button.title = label;
    }
  });
  return (
    <span
      ref={ref}
      data-part="icon-actions"
      className="inline-flex items-center gap-x-1 [&_button]:mx-0 [&_button]:gap-0 [&_button]:p-1 [&_button]:text-[0px] [&_svg]:!size-3.5"
    >
      {children}
    </span>
  );
}
