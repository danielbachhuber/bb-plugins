// Triaging a milestone, one issue at a time, in a banner right above the
// composer. The drafted comment can move into the composer, so editing and
// posting it is the same as writing any message. Invented data.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AskStatus = "done" | "partly" | "needed" | "obsolete";
type Outcome = "close" | "not-planned" | "keep" | "move";

const STATUS: Record<AskStatus, { glyph: string; label: string; className: string }> = {
  done: { glyph: "✓", label: "Done", className: "text-success" },
  partly: { glyph: "◐", label: "Partly", className: "text-warning" },
  needed: { glyph: "○", label: "Still needed", className: "text-warning" },
  obsolete: { glyph: "–", label: "Obsolete", className: "text-muted-foreground" },
};

const OUTCOMES: Record<Outcome, { label: string; verb: string }> = {
  close: { label: "Close: done", verb: "close" },
  "not-planned": { label: "Close: not planned", verb: "close as not planned" },
  keep: { label: "Keep open", verb: "keep open" },
  move: { label: "Move to 4.3", verb: "move to 4.3" },
};

export interface Issue {
  number: number;
  title: string;
  asks: { text: string; status: AskStatus; evidence: string }[];
  recommended: Outcome;
  why: string;
  comment: string;
}

export const issues: Issue[] = [
  {
    number: 101,
    title: "Export widgets as CSV",
    asks: [
      { text: "Export the widget list as CSV", status: "done", evidence: "#140" },
      { text: "Include archived widgets", status: "done", evidence: "#140, --archived" },
    ],
    recommended: "close",
    why: "both asks shipped in #140",
    comment: "This is done. #140 added Export to the widget list, and its --archived flag covers archived widgets.",
  },
  {
    number: 117,
    title: "Gadget sync drops the last row",
    asks: [{ text: "Sync every row", status: "needed", evidence: "still reproduces on main" }],
    recommended: "keep",
    why: "it still reproduces on main",
    comment: "Still reproduces on main: syncGadgets stops one row early when the page size divides the total.",
  },
  {
    number: 123,
    title: "Dark mode for the dashboard",
    asks: [{ text: "A dark theme for the dashboard", status: "obsolete", evidence: "covered by #98" }],
    recommended: "not-planned",
    why: "it duplicates #98",
    comment: "Closing as a duplicate of #98, which tracks dark mode across the whole app.",
  },
  {
    number: 126,
    title: "Widget import is slow for large files",
    asks: [
      { text: "Import 10k rows in under a minute", status: "partly", evidence: "#152: 2 min, down from 9" },
      { text: "Show progress while importing", status: "done", evidence: "#152" },
    ],
    recommended: "keep",
    why: "faster, but not yet under a minute",
    comment:
      "Progress on this: #152 batched the inserts and added a progress bar. A 10k-row import now takes about 2 minutes, down from 9, so the one-minute target is still open.",
  },
  {
    number: 130,
    title: "Rename the gadgets API",
    asks: [{ text: "Rename /gadgets to /devices", status: "needed", evidence: "no PR, nobody assigned" }],
    recommended: "move",
    why: "nobody is assigned and 4.2 ships Friday",
    comment: "Moving this to 4.3: nobody has picked it up and 4.2 ships Friday.",
  },
  {
    number: 134,
    title: "Settings page crashes with no widgets",
    asks: [{ text: "Load settings with no widgets", status: "done", evidence: "#149" }],
    recommended: "close",
    why: "fixed in #149",
    comment: "Fixed in #149, which handles an account with no widgets. Thanks for the report.",
  },
];

export interface TriageBannerProps {
  /** Writes into the composer's draft, as a plugin can with `useComposer()`. */
  onDraft: (text: string) => void;
  start?: number;
  initialDone?: Record<number, string>;
  /** The comment is in the composer; sending it posts it with the chosen outcome. */
  initialEditing?: boolean;
}

export function TriageBanner({ onDraft, start = 0, initialDone = {}, initialEditing = false }: TriageBannerProps) {
  const [index, setIndex] = useState(start);
  const [done, setDone] = useState<Record<number, string>>(initialDone);
  const [picked, setPicked] = useState<Record<number, Outcome>>({});
  const [editing, setEditing] = useState(initialEditing);
  const issue = issues[index];

  if (issue === undefined) {
    const outcomes = Object.values(done);
    const count = (word: string) => outcomes.filter((d) => d.includes(word)).length;
    const stillOpen = count("keep open");
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex-1 text-sm text-foreground">
          <b className="font-medium">Milestone 4.2 triaged.</b>
          <span className="text-muted-foreground">
            {" "}
            {count("posted")} comments posted: {count("close")} closed, {stillOpen} kept open, {count("move")} moved to 4.3.
          </span>
        </span>
        {/* Closing the milestone only makes sense once nothing in it is still open. */}
        {stillOpen === 0 ? (
          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs">
            Close milestone
          </Button>
        ) : null}
      </div>
    );
  }

  const outcome = picked[issue.number] ?? issue.recommended;
  const finish = (label: string) => {
    setDone((d) => ({ ...d, [issue.number]: label }));
    setEditing(false);
    onDraft("");
    setIndex((i) => i + 1);
  };

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="text-muted-foreground">Triage 4.2 · </span>
          <span className="font-mono text-xs text-muted-foreground">#{issue.number}</span>{" "}
          <b className="font-medium text-foreground">{issue.title}</b>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <button type="button" className="px-1 hover:text-foreground disabled:opacity-40" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} aria-label="Previous issue">
            ‹
          </button>
          {index + 1} of {issues.length}
          <button type="button" className="px-1 hover:text-foreground disabled:opacity-40" disabled={index === issues.length - 1} onClick={() => setIndex((i) => i + 1)} aria-label="Next issue">
            ›
          </button>
        </span>
      </div>
      <div className="border-t border-border px-3 py-2">
        <ul className="flex flex-col gap-1">
          {issue.asks.map((ask) => (
            <li key={ask.text} className="flex gap-2 text-xs">
              <span className={cn("w-3 text-center", STATUS[ask.status].className)}>{STATUS[ask.status].glyph}</span>
              <span className="text-foreground">{ask.text}</span>
              <span className="text-muted-foreground">
                <span className={STATUS[ask.status].className}>{STATUS[ask.status].label}</span> · {ask.evidence}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(Object.keys(OUTCOMES) as Outcome[]).map((o) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={outcome === o}
              onClick={() => setPicked((p) => ({ ...p, [issue.number]: o }))}
              className={cn(
                "rounded-md border px-2 py-0.5 text-xs",
                outcome === o ? "border-foreground/40 bg-state-active font-medium text-foreground" : "border-border text-muted-foreground hover:bg-state-hover",
              )}
            >
              {OUTCOMES[o].label}
              {o === issue.recommended ? " ★" : ""}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">★ {issue.why}</span>
        </div>
        {editing ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex-1">
              The comment is in the composer below. Send it to post and {OUTCOMES[outcome].verb}.
            </span>
            <button type="button" className="hover:text-foreground hover:underline" onClick={() => { setEditing(false); onDraft(""); }}>
              Cancel
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 line-clamp-2 border-l-2 border-border pl-2.5 text-xs text-muted-foreground">{issue.comment}</p>
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => finish(`posted, ${OUTCOMES[outcome].verb}`)}>
                Post and {OUTCOMES[outcome].verb}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  setEditing(true);
                  onDraft(issue.comment);
                }}
              >
                Edit comment
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => finish("skipped")}>
                Skip
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
