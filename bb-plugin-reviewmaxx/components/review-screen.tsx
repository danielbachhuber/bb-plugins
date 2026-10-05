// What the Reviewmaxx panel draws, from a ReviewResult. No data loading: the
// panel passes the result in, and the diff viewer too, so tests and stories
// render it without a server.
//
// The data attributes are a contract with scripts/verify.mjs: every item is an
// element with data-file and data-hunk, and the root reports "ready".
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { hunkPatch, type ReviewResult, type ReviewView, type ViewFile, type ViewHunk, type ViewSection } from "@/review/contract";
import { coverageLabel, hunkNote, staleLabel } from "./labels";

export type DiffViewComponent = ComponentType<{ patch: string; path: string }>;

export interface ReviewScreenProps {
  result: ReviewResult | null;
  error: string | null;
  generating: boolean;
  onGenerate: () => void;
  DiffView: DiffViewComponent;
}

export function ReviewScreen({ result, error, generating, onGenerate, DiffView }: ReviewScreenProps) {
  if (error !== null) return <Message text={`Could not load the review: ${error}`} />;
  if (result === null) return <Message text="Reading the branch…" />;
  if (result.state === "unavailable") return <Message text={result.message} ready />;
  const { view } = result;
  if (view.coverage.hunks === 0) return <Message text="No changes on this branch." ready />;

  return (
    <div data-reviewmaxx="ready" className="flex flex-col gap-3 p-3 text-sm">
      <Header view={view} generating={generating} onGenerate={onGenerate} />
      {view.stale && <Stale view={view} DiffView={DiffView} generating={generating} onGenerate={onGenerate} />}
      {view.concerns.map((section, i) => (
        <Section key={section.id} section={section} open={i === 0} DiffView={DiffView} />
      ))}
      {view.notYetGrouped && <Section section={view.notYetGrouped} open={view.concerns.length === 0} DiffView={DiffView} />}
      {view.mechanical && <Section section={view.mechanical} open={false} DiffView={DiffView} />}
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

function Header({ view, generating, onGenerate }: { view: ReviewView; generating: boolean; onGenerate: () => void }) {
  const label = view.headline === null ? "Generate" : "Regenerate";
  return (
    <div className="flex items-start justify-between gap-3">
      <p className={view.headline ? "font-medium" : "text-muted-foreground"}>
        {view.headline ?? "Not grouped yet. Generate asks this thread's agent to group the branch into concerns."}
      </p>
      {/* Regenerate lives in the stale banner when there is one. */}
      {!view.stale && (
        <Button size="sm" variant="outline" disabled={generating} onClick={onGenerate}>
          {generating ? "Sent to the agent" : label}
        </Button>
      )}
    </div>
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

function Section({ section, open, DiffView }: { section: ViewSection; open: boolean; DiffView: DiffViewComponent }) {
  const count = section.files.reduce((n, f) => n + f.hunks.filter((h) => h.status !== "removed").length, 0);
  return (
    <details data-section={section.id} open={open} className="rounded-md border">
      <summary className="cursor-pointer px-3 py-2 font-medium">
        {section.title} <span className="text-xs font-normal text-muted-foreground">({count})</span>
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        {section.note && <p className="text-muted-foreground">{section.note}</p>}
        {section.files.map((file) => (
          <FileBlock key={file.path} file={file} DiffView={DiffView} />
        ))}
      </div>
    </details>
  );
}

function FileBlock({ file, DiffView }: { file: ViewFile; DiffView: DiffViewComponent }) {
  const note = hunkNote(file);
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-xs">
        {file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
        {note && <span className="ml-2 text-muted-foreground">{note}</span>}
      </p>
      {file.hunks.map((hunk) => (
        <HunkBlock key={`${hunk.index}-${hunk.status}`} file={file} hunk={hunk} DiffView={DiffView} />
      ))}
    </div>
  );
}

function HunkBlock({ file, hunk, DiffView }: { file: ViewFile; hunk: ViewHunk; DiffView: DiffViewComponent }) {
  const attrs = { "data-file": hunk.path, "data-hunk": hunk.index, "data-kind": hunk.kind, "data-status": hunk.status };
  if (hunk.status === "removed") {
    return (
      <p {...attrs} className="text-xs text-muted-foreground line-through">
        Hunk {hunk.index + 1} is no longer in the diff.
      </p>
    );
  }
  return (
    <div {...attrs} className="flex flex-col gap-1">
      {hunk.status === "changed" && <span className="w-fit rounded bg-amber-500/20 px-1.5 text-xs">changed since grouping</span>}
      {hunk.kind === "file" ? (
        <p className="text-xs text-muted-foreground">{wholeFileText(file)}</p>
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
