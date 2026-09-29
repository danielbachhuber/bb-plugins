// The action-line pieces every sweep draws the same way.
import { useCallback, useEffect, useRef, useState } from "react";

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
