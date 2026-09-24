// An item's draft, edited the way the markdown-editor plugin edits a file: a
// Preview/Raw toggle over one buffer, Preview rendered with bb's own markdown
// renderer and Raw a plain textarea. An item that can no longer be sent shows
// the preview alone.
import { useState } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

type Mode = "preview" | "raw";

function SegmentButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon name={icon} className="size-3.5" />
      {label}
    </button>
  );
}

export interface DraftEditorProps {
  label: string;
  value: string;
  /** Absent when the draft can no longer be sent: only the preview shows. */
  onChange?: (value: string) => void;
  /** The published draft, which Reset goes back to. */
  original: string;
  initialMode?: Mode;
}

export function DraftEditor({ label, value, onChange, original, initialMode = "preview" }: DraftEditorProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const editable = onChange !== undefined;
  const edited = editable && value.trim() !== original.trim();
  const showing = editable ? mode : "preview";

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {label}
          {edited ? " · edited" : ""}
        </span>
        {edited ? (
          <button type="button" className="hover:text-foreground hover:underline" onClick={() => onChange(original)}>
            Reset
          </button>
        ) : null}
        {editable ? (
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5">
            <SegmentButton active={mode === "preview"} onClick={() => setMode("preview")} icon="Eye" label="Preview" />
            <SegmentButton active={mode === "raw"} onClick={() => setMode("raw")} icon="Code" label="Raw" />
          </div>
        ) : null}
      </div>
      {showing === "preview" ? (
        <div
          className={cn("rounded-md border border-border bg-background px-3 py-2 text-sm", editable && "cursor-text")}
          // Clicking into the rendered text is the obvious way to start editing it.
          onDoubleClick={editable ? () => setMode("raw") : undefined}
          title={editable ? "Double-click to edit" : undefined}
        >
          <Markdown content={value} />
        </div>
      ) : (
        <textarea
          aria-label={label}
          spellCheck={false}
          autoFocus
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          rows={Math.min(16, Math.max(4, value.split("\n").length + Math.ceil(value.length / 90)))}
          value={value}
          onChange={(event) => onChange!(event.target.value)}
        />
      )}
    </div>
  );
}
