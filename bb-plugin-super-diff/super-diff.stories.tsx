// Super Diff's own pieces, rendered from an invented Super Diff (see
// super-diff.fixtures.ts). In bb the row sits under the Diff tab's toolbar and
// copies the classes of bb's Stacked/Split control from the page; here those
// classes are passed in, copied from that control.
import { useRef, type ReactNode } from "react";
import type { DiffFileEntry } from "@bb/server-contract";
import { DiffFileCard } from "@bb-app/components/secondary-panel/git-diff/DiffFileCard";
import { DEFAULT_CODE_OVERFLOW_MODE } from "@bb-app/lib/code-overflow-mode";
import { NoteCard, NoteRows, NotesBox } from "./annotations";
import { ConcernHeader } from "./concern";
import { FIXTURE, FIXTURE_NOTES, FIXTURE_VIEWED, LAYOUT_PATCH, LAYOUT_PATH } from "./super-diff.fixtures";
import { SuperDiffRow, type ConcernLink, type ThreadState } from "./row";

export default {
  title: "super-diff/Super Diff",
};

const SEGMENT_CLASS = "inline-flex items-center gap-1 rounded-lg border border-border p-0.5";
const SEGMENT_BUTTON_CLASS =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 hover:bg-state-hover hover:text-foreground aria-pressed:bg-state-active aria-pressed:text-foreground text-xs h-7 rounded-md px-2.5 text-muted-foreground";

const FILE_COUNT = FIXTURE.paths.length;
const READY: ThreadState = { phase: "ready", showing: "super", stored: FIXTURE, data: null };
const LINKS: ConcernLink[] = FIXTURE.submission.concerns.map((concern, index) => ({
  number: index + 1,
  title: concern.title,
  viewed: concern.files.filter((path) => FIXTURE_VIEWED.has(path)).length,
  total: concern.files.length,
}));

function Frame({ children }: { children: ReactNode }) {
  return (
    <div data-screenshot-frame className="w-[620px] bg-background px-4 pb-4 pt-1">
      {children}
    </div>
  );
}

/** Two of concern 1's files, edited since the Super Diff was written. */
const CHANGED: ReadonlySet<string> = new Set(FIXTURE.submission.concerns[0]!.files.slice(1, 3));

function Row({ state, fileCount = FILE_COUNT, changed = false }: { state: ThreadState; fileCount?: number; changed?: boolean }) {
  return (
    <SuperDiffRow
      state={state}
      fileCount={fileCount}
      segmentClass={SEGMENT_CLASS}
      segmentButtonClass={SEGMENT_BUTTON_CLASS}
      onGenerate={() => {}}
      onShow={() => {}}
      concernLinks={state.phase === "ready" ? LINKS.map((link, index) => (changed && index === 0 ? { ...link, changed: CHANGED.size } : link)) : []}
      current={0}
      changedCount={changed ? CHANGED.size : 0}
    />
  );
}

function Concern({ index }: { index: number }) {
  const concern = FIXTURE.submission.concerns[index]!;
  const files = new Set(concern.files);
  return (
    <ConcernHeader
      number={index + 1}
      first={index === 0}
      title={concern.title}
      explanation={concern.explanation}
      files={concern.files.map((path) => ({ path, summary: concern.summaries?.[path] }))}
      others={concern.others}
      showList
      viewed={FIXTURE_VIEWED}
      onJump={() => {}}
    >
      <NotesBox notes={FIXTURE_NOTES.filter((note) => files.has(note.path))} onJump={() => {}} />
    </ConcernHeader>
  );
}

const LAYOUT_ENTRY: DiffFileEntry = {
  path: LAYOUT_PATH,
  previousPath: null,
  changeKind: "modified",
  additions: 2,
  deletions: 2,
  binary: false,
  origin: "tracked",
  loadMode: "auto",
};

/** bb's own file card, with note 1 placed under its line the way the panel places it. */
function LayoutDiff() {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={ref}>
      <DiffFileCard
        entry={LAYOUT_ENTRY}
        presentation={{ view: "unified", overflow: DEFAULT_CODE_OVERFLOW_MODE, showLineNumbers: true }}
        isCollapsed={false}
        onToggleCollapsed={() => {}}
        patchState={{ status: "loaded", patch: LAYOUT_PATCH }}
        onLoadPatch={() => {}}
        onRetry={() => {}}
      />
      <NoteRows containerRef={ref} notes={[{ ...FIXTURE_NOTES[0]!, line: 19 }]} highlightId={null} />
    </div>
  );
}

/** A Super Diff of a 57-file rename: the row with every concern listed, the first concern with what each file's change is and its annotation, and one of its files in bb's diff with that annotation under the line it explains. */
export const Overview = () => (
  <Frame>
    <Row state={READY} />
    <div className="h-3" />
    <Concern index={0} />
    <LayoutDiff />
  </Frame>
);

/** All six concerns of the same Super Diff, each with what its files' changes are, how many of them Diff Viewed has marked viewed, and its annotations. In bb, each concern's diff cards follow its heading. */
export const AllConcerns = () => (
  <Frame>
    {FIXTURE.submission.concerns.map((concern, index) => (
      <Concern key={concern.title} index={index} />
    ))}
  </Frame>
);

/** Before anything is generated: bb's own diff, with Generate Super Diff on the left of the row. */
export const NotGenerated = () => (
  <Frame>
    <Row state={{ phase: "idle" }} />
  </Frame>
);

/** The thread has no changes yet, so Generate Super Diff waits, greyed out, until it does. */
export const NoDiff = () => (
  <Frame>
    <Row state={{ phase: "idle" }} fileCount={0} />
  </Frame>
);

/** While the thread's agent reads the diff and writes the Super Diff. */
export const Generating = () => (
  <Frame>
    <Row state={{ phase: "generating", requestedAt: new Date(Date.now() - 60_000).toISOString() }} />
  </Frame>
);

/** A Super Diff is showing: the toggle switches back to bb's own list, the line counts what the agent wrote, and each concern is listed with how many of its files are viewed. Clicking one jumps to it; the one at the top of the list is highlighted. */
export const ShowingSuperDiff = () => (
  <Frame>
    <Row state={READY} />
  </Frame>
);

/** Two files have joined the diff and two have been edited since the Super Diff was written, so the row turns amber and offers Regenerate, and the concern with edited files says how many. */
export const OutOfDate = () => (
  <Frame>
    <Row state={READY} fileCount={FILE_COUNT + 2} changed />
  </Frame>
);

/** A concern whose files were edited after the Super Diff was written: each one is marked changed, since its summary may no longer be right. */
export const ChangedFiles = () => {
  const concern = FIXTURE.submission.concerns[0]!;
  return (
    <Frame>
      <ConcernHeader
        number={1}
        first
        title={concern.title}
        explanation={concern.explanation}
        files={concern.files.map((path) => ({ path, summary: concern.summaries?.[path] }))}
        showList
        viewed={FIXTURE_VIEWED}
        onJump={() => {}}
        changed={CHANGED}
      />
    </Frame>
  );
};

/** A concern's annotations, under its file list: each one's number, title, and line, which jumps to its card. One note's line has left the diff. */
export const AnnotationList = () => (
  <Frame>
    <NotesBox
      notes={[FIXTURE_NOTES[1]!, { ...FIXTURE_NOTES[1]!, id: "gone", n: 3, line: null, path: "src/data/legacy-pricing.ts", title: "Kept for orders placed before the switch" }]}
      onJump={() => {}}
    />
  </Frame>
);

/** A note card as it sits under the line it explains, inside the diff. */
export const AnnotationCard = () => (
  <Frame>
    <NoteCard highlighted={false} note={FIXTURE_NOTES[1]!} />
  </Frame>
);

/** Explain this: the card under a line while a fork of the thread writes its note, and the note once it is written, marked as one you asked for. */
export const ExplainThis = () => (
  <Frame>
    <NoteCard
      highlighted={false}
      note={{ ...FIXTURE_NOTES[0]!, id: "explaining", n: 0, pending: true, title: "Explaining line 19…", body: "A hidden side chat of this thread is reading the change. The note appears here when it is written, usually within a couple of minutes." }}
    />
    <NoteCard
      highlighted={false}
      note={{ ...FIXTURE_NOTES[0]!, id: "asked", n: 5, asked: true, title: "Reads the host so checkout and pricing agree", body: "This layout renders before `PricingProvider` exists, so it cannot ask the provider. `currencyFromHost()` is the same lookup the provider makes, which keeps the region check and the prices on one currency." }}
    />
  </Frame>
);

/** A concern's heading with Diff Viewed installed: its viewed count, then each file and what its change does. Files that change the same mechanical way share one line. */
export const ConcernFileList = () => {
  const concern = FIXTURE.submission.concerns[4]!;
  return (
    <Frame>
      <ConcernHeader
        number={5}
        first
        title={concern.title}
        explanation={concern.explanation}
        files={concern.files.map((path) => ({ path, summary: concern.summaries?.[path] }))}
        others={concern.others}
        showList
        viewed={FIXTURE_VIEWED}
        onJump={() => {}}
      />
    </Frame>
  );
};
