// The few icons the list draws, imported one by one so this package does not
// need a plugin's icon registry. Same glyphs as the plugins' `Icon` names.
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Edit02Icon,
  Layers01Icon,
  LockIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

const ICONS = {
  AlertCircle: AlertCircleIcon,
  ChevronDown: ArrowDown01Icon,
  ChevronRight: ArrowRight01Icon,
  Check: Tick02Icon,
  CircleCheck: CheckmarkCircle02Icon,
  CircleX: CancelCircleIcon,
  Copy: Copy01Icon,
  Edit: Edit02Icon,
  Layers: Layers01Icon,
  Lock: LockIcon,
  X: Cancel01Icon,
} satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <HugeiconsIcon icon={ICONS[name]} className={className} aria-hidden="true" data-icon={name} />;
}
