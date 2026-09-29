import { useEffect, useRef, type ReactNode } from "react";
import { StoryCard, StoryRow } from "@bb-ladle/story-card";

import { StatusBanner } from "./banner";
import { Icon } from "./icons";
import { SweepList, type SweepListProps } from "./list";
import type { Run, Stage, SweepItem } from "./types";

export default {
  title: "sweep-ui/Sweep list",
};

const STAGES: Stage[] = [
  { name: "Backlog", color: "bg-slate-400" },
  { name: "Ready", color: "bg-sky-500" },
  { name: "In progress", color: "bg-amber-500" },
  { name: "In review", color: "bg-violet-500" },
];

// Issue Sweep's runs, in list order.
const RUNS: Run[] = [
  { id: "new", label: "new comments", labelOne: "new comment", tone: "new", tier: "now" },
  { id: "stale", label: "stale", labelOne: "stale", tone: "late", tier: "now" },
  { id: "working", label: "working", labelOne: "working", tone: "underway", tier: "now" },
  { id: "to-start", label: "to start", labelOne: "to start", tone: "next", tier: "next" },
  { id: "review", label: "waiting on review", labelOne: "waiting on review", tone: "later", tier: "later" },
  { id: "later", label: "later", labelOne: "later", tone: "later", tier: "later" },
  { id: "blocked", label: "blocked", labelOne: "blocked", tone: "later", tier: "later" },
];

function item(number: number, runId: string, title: string, overrides: Partial<SweepItem> = {}): SweepItem {
  const repo = "acme/widgets";
  return {
    key: `${repo}#${number}`,
    runId,
    title,
    url: `https://github.com/${repo}/issues/${number}`,
    number,
    newComments: 0,
    flags: [],
    facts: ["2d ago"],
    parent: null,
    note: null,
    stage: 0,
    ...overrides,
  };
}

const ROADMAP = { number: 140, title: "Widget export, second pass", url: "https://github.com/acme/widgets/issues/140" };

function AddToBoard() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-border px-2 py-0.5">
      Add to board <Icon name="ChevronDown" className="size-3" />
    </span>
  );
}

const ITEMS: SweepItem[] = [
  item(412, "new", "Export drops the last row when a widget has no label", {
    newComments: 3,
    facts: ["1h ago", "hubber"],
    stage: 2,
    note: "Reply to hubber about the empty-label case",
  }),
  item(398, "new", "Rotate handles disappear at 200% zoom", { newComments: 1, facts: ["5h ago"], stage: 1 }),
  item(371, "stale", "Gadget picker forgets the last folder", {
    flags: [{ kind: "stale", text: "No activity for 12 days" }],
    facts: ["12d ago"],
    stage: 2,
  }),
  item(405, "working", "Split widget settings into their own tab", {
    facts: ["3h ago", "2/5 sub-issues"],
    stage: 2,
    parent: ROADMAP,
    progress: { done: 2, total: 5 },
    note: "Finish the keyboard order, then ask octocat to review",
  }),
  item(420, "to-start", "Show the widget count in the sidebar", { facts: ["1d ago"], stage: 1 }),
  item(417, "to-start", "Widget colors ignore the dark theme", { facts: ["2d ago"], stage: null, offTrack: <AddToBoard /> }),
  item(409, "to-start", "Sort gadgets by last used", { facts: ["4d ago"], stage: 1, parent: ROADMAP }),
  item(388, "review", "Keep scroll position after a widget refresh", { facts: ["6d ago"], stage: 3 }),
  item(384, "review", "Faster gadget search on large accounts", { facts: ["1w ago"], stage: 3 }),
  item(366, "later", "Widget templates", { facts: ["3w ago"] }),
  item(361, "later", "Import widgets from a spreadsheet", { facts: ["3w ago"] }),
  item(352, "later", "Bulk-rename gadgets", { facts: ["1mo ago"] }),
  item(349, "later", "Undo for widget deletes", { facts: ["1mo ago"], stage: null, offTrack: "Stalled" }),
  item(340, "later", "Widget previews in search results", { facts: ["1mo ago"] }),
  item(333, "later", "Share a gadget by link", { facts: ["2mo ago"] }),
  item(327, "later", "Printable widget sheets", { facts: ["2mo ago"] }),
  item(318, "later", "Keyboard shortcuts for the gadget tray", { facts: ["2mo ago"] }),
  item(302, "blocked", "Move widgets between accounts", {
    flags: [{ kind: "blocked", text: "Blocked by #296" }],
    facts: ["3mo ago"],
    stage: 1,
    blockedStage: 2,
  }),
  item(299, "blocked", "Gadget history view", { flags: [{ kind: "blocked", text: "Blocked by #412" }], facts: ["3mo ago"] }),
];

function LineAction({ label, icon }: { label: string; icon: "Copy" | "ChevronRight" }) {
  return (
    <button type="button" className="-mx-1 inline-flex items-center gap-1 rounded px-1 hover:bg-accent hover:text-foreground">
      <Icon name={icon} className="size-3" />
      {label}
    </button>
  );
}

const props: SweepListProps = {
  stages: STAGES,
  runs: RUNS,
  items: ITEMS,
  renderActions: (each) => (
    <>
      <LineAction label={each.runId === "working" ? "Open thread" : "Start thread"} icon="ChevronRight" />
      <LineAction label="Copy link" icon="Copy" />
    </>
  ),
  onMove: () => {},
  onNoteSave: async () => true,
};

function Frame({ children }: { children: ReactNode }) {
  return <div className="w-[1000px] rounded-lg border border-border bg-background px-4 pb-4 pt-3">{children}</div>;
}

// The list keeps its filter and open rows in its own state, so a story that
// shows one presses the button once it has mounted.
function Pressed({ name, children }: { name: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Strict mode runs effects twice, and a second press would undo the first.
  const pressed = useRef(false);
  useEffect(() => {
    if (pressed.current) return;
    pressed.current = true;
    const button = Array.from(ref.current?.querySelectorAll("button") ?? []).find((each) =>
      each.textContent?.includes(name),
    );
    button?.click();
  }, [name]);
  return <div ref={ref}>{children}</div>;
}

/** Now rows open, Next rows closed to their number line, and Later rows one line each, folded after five. */
export function List() {
  return (
    <StoryCard>
      <StoryRow label="An issue tab" hint="Three Now, three Next, and twelve Later rows.">
        <Frame>
          <SweepList {...props} />
        </Frame>
      </StoryRow>
    </StoryCard>
  );
}

/** Pressing a run's squares leaves only its rows, and every Later row in it shows. */
export function Filtered() {
  return (
    <StoryCard>
      <StoryRow label="Filtered to later" hint="The other runs fade, and the fold is gone.">
        <Frame>
          <Pressed name="8 later">
            <SweepList {...props} />
          </Pressed>
        </Frame>
      </StoryRow>
    </StoryCard>
  );
}

// A plugin's own row body, drawn by renderBody. PR Sweep draws its rows this way.
const BODY_ITEMS: SweepItem[] = [
  item(431, "new", "Widget export drops the header row", {
    icon: <Icon name="AlertCircle" className="size-4 text-destructive-text" />,
    facts: ["2h ago"],
    stage: 1,
    blockedStage: 1,
    newComments: 2,
  }),
  item(428, "stale", "Remember the gadget tray's width", {
    icon: <Icon name="CircleCheck" className="size-4 text-success" />,
    facts: ["5h ago"],
    stage: 3,
    note: "Merge after octocat's release",
  }),
  item(425, "to-start", "Gadget tray keyboard order", { facts: ["1d ago"], stage: 2 }),
  item(419, "later", "Widget thumbnails in search", { facts: ["3d ago"], stage: 2 }),
];

function body(each: SweepItem, _open: boolean, line: boolean): ReactNode {
  const detail = <span className="text-xs text-muted-foreground">Detail for #{each.number}</span>;
  if (line) return detail;
  return (
    <>
      {each.blockedStage != null ? <StatusBanner tone="blocked">2 failing checks</StatusBanner> : null}
      {each.stage === 3 ? <StatusBanner tone="ready">Ready to merge</StatusBanner> : null}
      <div className="mt-1.5">{detail}</div>
    </>
  );
}

/** A row body the plugin draws itself: the title line keeps its icon, number, and age, with a red or green banner under it. */
export function CustomBody() {
  return (
    <StoryCard>
      <StoryRow label="With renderBody" hint="A blocked banner and a red cross on the track, a ready banner, a closed row, and a one-line row.">
        <Frame>
          <SweepList {...props} items={BODY_ITEMS} renderBody={body} />
        </Frame>
      </StoryRow>
    </StoryCard>
  );
}
