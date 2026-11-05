// The strip above the comment box: Write and Preview tabs, and the formatting
// buttons GitHub's comment editor has, led by Add a suggestion on a line of
// new code. What each button does to the text lives in ./markdown.
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  CheckListIcon,
  FileDiffIcon,
  Heading01Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MoreHorizontalIcon,
  SourceCodeIcon,
  TextBoldIcon,
  TextItalicIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { FormatAction } from "./markdown";

export type EditorTab = "write" | "preview";

interface Tool {
  action: FormatAction;
  icon: IconSvgElement;
  label: string;
}

const HEADING: Tool = { action: "heading", icon: Heading01Icon, label: "Heading" };
const BOLD: Tool = { action: "bold", icon: TextBoldIcon, label: "Bold (⌘B)" };
const ITALIC: Tool = { action: "italic", icon: TextItalicIcon, label: "Italic (⌘I)" };
const QUOTE: Tool = { action: "quote", icon: LeftToRightBlockQuoteIcon, label: "Quote (⌘⇧.)" };
const CODE: Tool = { action: "code", icon: SourceCodeIcon, label: "Code (⌘E)" };
const LINK: Tool = { action: "link", icon: Link01Icon, label: "Link (⌘K)" };
const NUMBERED: Tool = { action: "numbered", icon: LeftToRightListNumberIcon, label: "Numbered list (⌘⇧7)" };
const BULLETED: Tool = { action: "bulleted", icon: LeftToRightListBulletIcon, label: "Bulleted list (⌘⇧8)" };
const TASK: Tool = { action: "task", icon: CheckListIcon, label: "Task list (⌘⇧L)" };

/** GitHub's groups, in GitHub's order. */
const GROUPS: Tool[][] = [
  [HEADING, BOLD, ITALIC],
  [QUOTE, CODE, LINK],
  [NUMBERED, BULLETED, TASK],
];
/** What stays in the strip when it is too narrow for every group. */
const NARROW: Tool[] = [BOLD, ITALIC];
const MORE: Tool[] = [HEADING, QUOTE, CODE, LINK, NUMBERED, BULLETED, TASK];

/** Below this width the strip keeps the most used buttons and folds the rest under More. */
const NARROW_WIDTH = 520;

function IconButton({
  icon,
  label,
  pressed,
  onPress,
}: {
  icon: IconSvgElement;
  label: string;
  pressed?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      // Pressing a button must not take focus from the box, or the selection
      // the button acts on is gone by the time the click lands.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className={cn(
        "text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded",
        pressed === true && "bg-muted text-foreground",
      )}
    >
      <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="bg-border mx-1 h-4 w-px shrink-0" />;
}

/** Whether the element is narrower than `width`, read after layout. */
function useNarrow(width: number): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    // The strip's width comes from the diff column, not from its buttons, so
    // changing which buttons show cannot feed back into this measurement.
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setNarrow(entry.contentRect.width < width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [width]);
  return [ref, narrow];
}

export function EditorToolbar({
  tab,
  onTab,
  onFormat,
  onSuggest,
}: {
  tab: EditorTab;
  onTab: (tab: EditorTab) => void;
  onFormat: (action: FormatAction) => void;
  /** Present on a line of new code, where GitHub can apply a suggestion. */
  onSuggest?: () => void;
}) {
  const [ref, narrow] = useNarrow(NARROW_WIDTH);
  const [more, setMore] = useState(false);
  const tools = (list: Tool[]) =>
    list.map((tool) => (
      <IconButton key={tool.action} icon={tool.icon} label={tool.label} onPress={() => onFormat(tool.action)} />
    ));

  let buttons: ReactNode = null;
  if (tab === "write") {
    buttons = (
      <span className="ml-auto flex min-w-0 items-center pb-1">
        {onSuggest !== undefined ? (
          <>
            <IconButton icon={FileDiffIcon} label="Add a suggestion (⌘G)" onPress={onSuggest} />
            <Divider />
          </>
        ) : null}
        {narrow ? (
          <>
            {tools(NARROW)}
            <IconButton
              icon={MoreHorizontalIcon}
              label="More formatting"
              pressed={more}
              onPress={() => setMore((open) => !open)}
            />
          </>
        ) : (
          GROUPS.map((group, index) => (
            <span key={index} className="flex items-center">
              {index > 0 ? <Divider /> : null}
              {tools(group)}
            </span>
          ))
        )}
      </span>
    );
  }

  return (
    <div ref={ref} className="bg-muted/20 border-b">
      <div className="flex items-end gap-1 px-3 pt-1.5">
        {(["write", "preview"] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => onTab(name)}
            className={cn(
              "-mb-px rounded-t-md border px-3 py-1 text-xs font-medium",
              tab === name ? "bg-card border-b-card" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {name === "write" ? "Write" : "Preview"}
          </button>
        ))}
        {buttons}
      </div>
      {tab === "write" && narrow && more ? (
        <div className="flex flex-wrap justify-end border-t px-3 py-1">{tools(MORE)}</div>
      ) : null}
    </div>
  );
}
