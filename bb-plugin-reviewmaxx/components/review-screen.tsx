// What the Reviewmaxx panel draws, from a ReviewResult. No data loading: the
// panel passes the result in, and the diff and source viewers too, so tests
// and stories render it without a server.
//
// The data attributes are a contract with scripts/verify.mjs: every item is an
// element with data-file and data-hunk, the root reports "ready", each rail
// entry has data-rail-item and shows its concern, file cards are <details>,
// and a test concern's Diff button shows its hunks.
import { useState, type ComponentType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { hunkPatch, type ReviewResult, type ReviewView, type ViewFile, type ViewHunk, type ViewSection } from "@/review/contract";
import { coverageLabel, fileStats, hunkNote, staleLabel, testsLabel, viewedLabel } from "./labels";

export type DiffViewComponent = ComponentType<{ patch: string; path: string }>;
export type SourceViewComponent = ComponentType<{ content: string; path: string }>;

export interface ReviewScreenProps {
  result: ReviewResult | null;
  error: string | null;
  generating: boolean;
  onGenerate: () => void;
  onSetViewed: (path: string, viewed: boolean) => void;
  DiffView: DiffViewComponent;
  SourceView: SourceViewComponent;
}

/**
 * Main on the left and the rail on the right, the rail sticky so it stays
 * beside a long concern. A panel too narrow for both stacks them, rail on top
 * and not sticky, since a sticky rail above the content would cover it as it
 * scrolls. bb's stylesheet holds only the classes bb uses, so a container
 * query has to come from here.
 */
const LAYOUT_CSS = `
.rmx-body { container-type: inline-size; }
.rmx-columns { display: flex; flex-direction: column-reverse; gap: 1.25rem; }
.rmx-main { min-width: 0; }
@container (min-width: 30rem) {
  .rmx-columns { flex-direction: row; align-items: flex-start; }
  .rmx-main { flex: 1 1 0; }
  .rmx-rail { flex: 0 0 11rem; position: sticky; top: 1rem; }
}`;

interface Viewers {
  DiffView: DiffViewComponent;
  SourceView: SourceViewComponent;
  onSetViewed: (path: string, viewed: boolean) => void;
}

export function ReviewScreen({ result, error, generating, onGenerate, onSetViewed, DiffView, SourceView }: ReviewScreenProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  if (error !== null) return <Message text={`Could not load the review: ${error}`} />;
  if (result === null) return <Message text="Reading the branch…" />;
  if (result.state === "unavailable") return <Message text={result.message} ready />;
  const { view } = result;
  if (view.coverage.hunks === 0) return <Message text="No changes on this branch." ready />;

  const viewers: Viewers = { DiffView, SourceView, onSetViewed };
  const sections = [...view.concerns, view.notYetGrouped, view.mechanical].filter((s): s is ViewSection => s !== null);
  // The chosen section, or the first one when nothing is chosen or the choice is gone.
  const at = Math.max(0, sections.findIndex((s) => s.id === chosen));
  const section = sections[at]!;
  const choose = (id: string) => {
    setChosen(id);
    // Back to the top of the concern, since Next is pressed from the bottom of the last one.
    document.querySelector<HTMLElement>("[data-reviewmaxx-main]")?.scrollIntoView?.({ block: "start" });
  };
  return (
    <div data-reviewmaxx="ready" className="flex flex-col gap-5 p-4 text-sm">
      <Header view={view} generating={generating} onGenerate={onGenerate} />
      {view.stale && <Stale view={view} DiffView={DiffView} generating={generating} onGenerate={onGenerate} />}
      <style>{LAYOUT_CSS}</style>
      <div className="rmx-body">
        <div className="rmx-columns">
        <main data-reviewmaxx-main className="rmx-main flex flex-col gap-3">
          <Concern
            key={section.id}
            section={section}
            number={view.concerns.includes(section) ? at + 1 : null}
            of={view.concerns.length}
            viewers={viewers}
          />
          {sections[at + 1] && (
            <button
              type="button"
              onClick={() => choose(sections[at + 1]!.id)}
              className="flex items-center justify-end gap-1.5 self-end pt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Next: {sections[at + 1]!.title} <Icon name="ChevronRight" className="size-3.5" />
            </button>
          )}
        </main>
        <Rail view={view} sections={sections} chosen={section.id} onChoose={choose} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{coverageLabel(view.coverage)}</p>
    </div>
  );
}

function Message({ text, ready = false }: { text: string; ready?: boolean }) {
  return (
    <div data-reviewmaxx={ready ? "ready" : "loading"} className="p-6 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function Counts({ added, removed }: { added: number; removed: number }) {
  return (
    <span className="shrink-0 font-mono text-xs tabular-nums">
      <span className="text-diff-added">+{added}</span> <span className="text-diff-removed">−{removed}</span>
    </span>
  );
}

function sectionStats(section: ViewSection) {
  return section.files.reduce(
    (sum, f) => {
      const s = fileStats(f);
      return { added: sum.added + s.added, removed: sum.removed + s.removed };
    },
    { added: 0, removed: 0 },
  );
}

function Header({ view, generating, onGenerate }: { view: ReviewView; generating: boolean; onGenerate: () => void }) {
  const label = view.headline === null ? "Generate" : "Regenerate";
  const percent = view.coverage.files === 0 ? 0 : (view.coverage.viewed / view.coverage.files) * 100;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <h2 className={view.headline ? "text-base font-semibold leading-snug" : "text-muted-foreground"}>
          {view.headline ?? "Not grouped yet. Generate asks this thread's agent to group the branch into concerns."}
        </h2>
        {/* Regenerate lives in the stale banner when there is one. */}
        {!view.stale && (
          <Button size="sm" variant={view.headline ? "ghost" : "outline"} className="shrink-0" disabled={generating} onClick={onGenerate}>
            <Icon name="RotateCcw" className="size-3.5" /> {generating ? "Sent to the agent" : label}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{viewedLabel(view.coverage)}</span>
      </div>
    </header>
  );
}

/** The concerns down the right, each with its viewed count and lines changed. */
function Rail({ view, sections, chosen, onChoose }: { view: ReviewView; sections: ViewSection[]; chosen: string; onChoose: (id: string) => void }) {
  return (
    <nav aria-label="Concerns" className="rmx-rail flex flex-col gap-0.5">
      {sections.map((section) => {
        const n = view.concerns.indexOf(section);
        const viewed = section.files.filter((f) => f.viewed).length;
        const done = viewed === section.files.length;
        const current = section.id === chosen;
        return (
          <button
            key={section.id}
            type="button"
            data-rail-item={section.id}
            aria-current={current}
            onClick={() => onChoose(section.id)}
            className={`flex flex-col gap-0.5 rounded-md border-r-2 px-2.5 py-1.5 text-left ${
              n === -1 && section === sections.find((s) => !view.concerns.includes(s)) ? "mt-2" : ""
            } ${current ? "border-foreground bg-muted" : "border-transparent hover:bg-muted/50"}`}
          >
            <span className="flex items-start gap-1.5">
              <span className="w-3.5 shrink-0 pt-px text-xs font-semibold tabular-nums text-muted-foreground">
                {n === -1 ? <Icon name={section.id === "mechanical" ? "Archive" : "CircleDashed"} className="size-3.5" /> : n + 1}
              </span>
              <span className={`leading-snug ${current ? "font-semibold" : n === -1 || done ? "text-muted-foreground" : "font-medium"}`}>{section.title}</span>
            </span>
            <span className="flex items-center gap-2 pl-5 text-[11px] text-muted-foreground">
              {done ? <Icon name="Check" className="size-3 text-success" /> : <span className="tabular-nums">{`${viewed}/${section.files.length}`}</span>}
              {section.tests && <span>tests</span>}
              <Counts {...sectionStats(section)} />
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function Stale({
  view,
  DiffView,
  generating,
  onGenerate,
}: {
  view: ReviewView;
  DiffView: DiffViewComponent;
  generating: boolean;
  onGenerate: () => void;
}) {
  const stale = view.stale!;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <p>
          Grouped at <code>{stale.groupedHead.slice(0, 7)}</code> · {staleLabel(stale.commitsSince, stale.changedFiles.length)}
        </p>
        <Button size="sm" disabled={generating} onClick={onGenerate}>
          {generating ? "Sent to the agent" : "Regenerate"}
        </Button>
      </div>
      <details open>
        <summary className="cursor-pointer font-medium">Changed since grouping</summary>
        <div className="mt-2 flex flex-col gap-2">
          {stale.changedFiles.map((file) => (
            <div key={file.path}>
              <p className="font-mono text-xs">{file.path}</p>
              {file.patch ? (
                <DiffView patch={file.patch} path={file.path} />
              ) : (
                <p className="text-xs text-muted-foreground">Binary or too large to show; its content changed.</p>
              )}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: "scenarios" | "diff"; onChange: (mode: "scenarios" | "diff") => void }) {
  const item = (value: "scenarios" | "diff", label: string) => (
    <button
      type="button"
      data-mode={value}
      aria-pressed={mode === value}
      onClick={(event) => {
        event.preventDefault();
        onChange(value);
      }}
      className={`rounded px-2 py-0.5 text-xs font-medium ${mode === value ? "bg-background shadow-sm" : "text-muted-foreground"}`}
    >
      {label}
    </button>
  );
  return (
    <span className="inline-flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5">
      {item("scenarios", "Scenarios")}
      {item("diff", "Diff")}
    </span>
  );
}

/** The chosen concern: its title, note, and files, or for a test concern its scenarios. */
function Concern({ section, number, of, viewers }: { section: ViewSection; number: number | null; of: number; viewers: Viewers }) {
  const [mode, setMode] = useState<"scenarios" | "diff">("scenarios");
  const tests = section.tests;
  const showScenarios = tests !== null && mode === "scenarios";
  return (
    <section data-section={section.id} className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        {/* The title takes the room left and wraps, so the toggle never leaves a narrow panel. */}
        <div className="min-w-0 flex-1">
          {number !== null && (
            <p className="text-xs font-semibold text-muted-foreground">
              {number} of {of}
            </p>
          )}
          <h3 className="text-base font-semibold leading-snug">{section.title}</h3>
        </div>
        {tests && <ModeToggle mode={mode} onChange={setMode} />}
      </div>
      {section.note && <p className="text-muted-foreground">{section.note}</p>}
      {showScenarios ? (
        <>
          <p className="text-xs text-muted-foreground">{testsLabel(tests)}</p>
          <div className="overflow-hidden rounded-md border">
            {/* A path per concern: bb's viewer caches lines by path, and a shared one
                kept the last concern's line count when switching concerns. */}
            <viewers.SourceView content={tests.covered} path={`${section.id}/scenarios.feature`} />
          </div>
          <h4 className="pt-1 font-semibold">Not covered</h4>
          <div className="overflow-hidden rounded-md border border-dashed">
            <viewers.SourceView content={tests.notCovered} path={`${section.id}/not-covered.feature`} />
          </div>
        </>
      ) : (
        section.files.map((file) => <FileCard key={file.path} file={file} viewers={viewers} />)
      )}
    </section>
  );
}

function PathLabel({ file }: { file: ViewFile }) {
  const at = file.path.lastIndexOf("/");
  return (
    <span className="truncate font-mono text-xs">
      {file.previousPath && <span className="text-muted-foreground">{file.previousPath} → </span>}
      <span className="text-muted-foreground">{file.path.slice(0, at + 1)}</span>
      <span className="font-medium">{file.path.slice(at + 1)}</span>
    </span>
  );
}

/** A file as a header bar with its hunks under it; viewed files start folded. */
function FileCard({ file, viewers }: { file: ViewFile; viewers: Viewers }) {
  const note = hunkNote(file);
  return (
    <details data-file-card={file.path} open={!file.viewed} className="overflow-hidden rounded-md border">
      <summary className={`flex cursor-pointer list-none items-center gap-2 bg-muted/50 px-3 py-1.5 ${file.viewed ? "opacity-60" : ""}`}>
        <PathLabel file={file} />
        {file.fileStatus === "added" && <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium text-success">new</span>}
        {note && <span className="shrink-0 text-xs text-muted-foreground">{note}</span>}
        <span className="ml-auto" />
        <Counts {...fileStats(file)} />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" onClick={(event) => event.stopPropagation()}>
          <Checkbox aria-label={`Viewed ${file.path}`} checked={file.viewed} onCheckedChange={(checked) => viewers.onSetViewed(file.path, checked === true)} />
          Viewed
        </label>
      </summary>
      <div className="flex flex-col gap-1 border-t">
        {file.hunks.map((hunk) => (
          <HunkBlock key={`${hunk.index}-${hunk.status}`} file={file} hunk={hunk} DiffView={viewers.DiffView} />
        ))}
      </div>
    </details>
  );
}

function HunkBlock({ file, hunk, DiffView }: { file: ViewFile; hunk: ViewHunk; DiffView: DiffViewComponent }) {
  const attrs = { "data-file": hunk.path, "data-hunk": hunk.index, "data-kind": hunk.kind, "data-status": hunk.status };
  if (hunk.status === "removed") {
    return (
      <p {...attrs} className="px-3 py-1 text-xs text-muted-foreground line-through">
        Hunk {hunk.index + 1} is no longer in the diff.
      </p>
    );
  }
  return (
    <div {...attrs} className="flex flex-col gap-1">
      {hunk.status === "changed" && <span className="mx-3 mt-1 w-fit rounded bg-amber-500/20 px-1.5 text-xs">changed since grouping</span>}
      {hunk.kind === "file" ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{wholeFileText(file)}</p>
      ) : (
        <DiffView patch={hunkPatch(file, hunk)} path={file.path} />
      )}
    </div>
  );
}

function wholeFileText(file: ViewFile): string {
  if (file.binary) return "Binary file changed.";
  if (file.fileStatus === "renamed") return `Renamed from ${file.previousPath}, with no other change.`;
  if (file.fileStatus === "added") return "New empty file.";
  if (file.fileStatus === "deleted") return "Deleted empty file.";
  return "Mode changed.";
}
