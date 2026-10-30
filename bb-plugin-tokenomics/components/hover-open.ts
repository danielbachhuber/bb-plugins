// Opens a popover when the pointer rests on its trigger, as well as on a
// click, and keeps it open while the pointer is on the popover. Spread
// `hover` on both the trigger and the content. A touch or pen only opens it
// on a tap.
import { useEffect, useRef, useState, type PointerEvent } from "react";

/** How long the pointer rests before the popover opens, and how long it may leave before it closes. */
const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 150;

export function useHoverOpen({ defaultOpen = false, onOpen }: { defaultOpen?: boolean; onOpen?: () => void } = {}) {
  const [open, setOpen] = useState(defaultOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  useEffect(() => {
    if (open) onOpen?.();
    // onOpen is a fresh closure each render; calling it once per opening is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const later = (next: boolean, delay: number) => {
    clear();
    timer.current = setTimeout(() => setOpen(next), delay);
  };
  return {
    open,
    onOpenChange: (next: boolean) => {
      clear();
      setOpen(next);
    },
    hover: {
      onPointerEnter: (event: PointerEvent) => {
        if (event.pointerType === "mouse") later(true, open ? 0 : OPEN_DELAY_MS);
      },
      onPointerLeave: (event: PointerEvent) => {
        if (event.pointerType === "mouse") later(false, CLOSE_DELAY_MS);
      },
    },
  };
}
