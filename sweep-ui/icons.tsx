// The few icons the list draws, imported one by one so this package does not
// need a plugin's icon registry. Same glyphs as the plugins' `Icon` names.
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Copy01Icon,
  Edit02Icon,
  Layers01Icon,
  LockIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

const ICONS = {
  ChevronDown: ArrowDown01Icon,
  ChevronRight: ArrowRight01Icon,
  Check: Tick02Icon,
  Copy: Copy01Icon,
  Edit: Edit02Icon,
  Layers: Layers01Icon,
  Lock: LockIcon,
} satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <HugeiconsIcon icon={ICONS[name]} className={className} aria-hidden="true" data-icon={name} />;
}
