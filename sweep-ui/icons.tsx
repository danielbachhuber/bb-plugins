// The few icons the list draws, imported one by one so this package does not
// need a plugin's icon registry. Same glyphs as the plugins' `Icon` names.
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  AlertCircleIcon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  BubbleChatIcon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  Edit02Icon,
  GitPullRequestArrow,
  GitPullRequestDraftIcon,
  InformationCircleIcon,
  Layers01Icon,
  LockIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

const ICONS = {
  AlertCircle: AlertCircleIcon,
  AlertTriangle: Alert02Icon,
  ChevronDown: ArrowDown01Icon,
  ChevronRight: ArrowRight01Icon,
  Check: Tick02Icon,
  CircleCheck: CheckmarkCircle02Icon,
  CircleX: CancelCircleIcon,
  Comment: BubbleChatIcon,
  Clock: Clock01Icon,
  Copy: Copy01Icon,
  Edit: Edit02Icon,
  GitPullRequestArrow: GitPullRequestArrow,
  GitPullRequestDraft: GitPullRequestDraftIcon,
  Info: InformationCircleIcon,
  Layers: Layers01Icon,
  Lock: LockIcon,
  X: Cancel01Icon,
} satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof ICONS;

/** Hidden from assistive technology unless it has a `label`, which then names it. */
export function Icon({ name, className, label }: { name: IconName; className?: string; label?: string }) {
  return label ? (
    <HugeiconsIcon icon={ICONS[name]} className={className} aria-label={label} data-icon={name} />
  ) : (
    <HugeiconsIcon icon={ICONS[name]} className={className} aria-hidden="true" data-icon={name} />
  );
}
