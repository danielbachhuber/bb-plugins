// Super Diff's own pieces, rendered from an invented Super Diff (see
// super-diff.fixtures.ts). In bb the row sits under the Diff tab's toolbar and
// copies the classes of bb's Stacked/Split control from the page; here those
// classes are passed in, copied from that control.
import type { ReactNode } from "react";
import { NoteCard, NotesBox } from "./annotations";
import { ConcernHeader } from "./concern";
import { FIXTURE, FIXTURE_NOTES, FIXTURE_VIEWED } from "./super-diff.fixtures";
import { SuperDiffRow, type ThreadState } from "./row";

export default {
  title: "super-diff/Super Diff",
};

const SEGMENT_CLASS = "inline-flex items-center gap-1 rounded-lg border border-border p-0.5";
const SEGMENT_BUTTON_CLASS =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 hover:bg-state-hover hover:text-foreground aria-pressed:bg-state-active aria-pressed:text-foreground text-xs h-7 rounded-md px-2.5 text-muted-foreground";

const FILE_COUNT = FIXTURE.paths.length;
const READY: ThreadState = { phase: "ready", showing: "super", stored: FIXTURE, data: null };

function Frame({ children }: { children: ReactNode }) {
  return (
    <div data-screenshot-frame className="w-[620px] bg-background px-4 pb-4 pt-1">
      {children}
    </div>
  );
}

function Row({ state, fileCount = FILE_COUNT }: { state: ThreadState; fileCount?: number }) {
  return (
    <SuperDiffRow
      state={state}
      fileCount={fileCount}
      segmentClass={SEGMENT_CLASS}
      segmentButtonClass={SEGMENT_BUTTON_CLASS}
      onGenerate={() => {}}
      onShow={() => {}}
    />
  );
}

function Concerns() {
  return (
    <>
      {FIXTURE.submission.concerns.map((concern, index) => (
        <ConcernHeader
          key={concern.title}
          number={index + 1}
          title={concern.title}
          explanation={concern.explanation}
          files={concern.files.map((path) => ({ path, summary: concern.summaries?.[path] }))}
          others={concern.others}
          showList
          viewed={FIXTURE_VIEWED}
          onJump={() => {}}
        />
      ))}
    </>
  );
}

/** A Super Diff of a 57-file rename: the row, the annotation list, then six concerns, each with what its files' changes are and how many of them Diff Viewed has marked viewed. In bb, each concern's diff cards follow its heading. */
export const Overview = () => (
  <Frame>
    <Row state={READY} />
    <div className="mt-3">
      <NotesBox notes={FIXTURE_NOTES} onJump={() => {}} />
    </div>
    <Concerns />
  </Frame>
);

/** Before anything is generated: bb's own diff, with Generate Super Diff on the left of the row. */
export const NotGenerated = () => (
  <Frame>
    <Row state={{ phase: "idle" }} />
  </Frame>
);

/** While the thread's agent reads the diff and writes the Super Diff. */
export const Generating = () => (
  <Frame>
    <Row state={{ phase: "generating", requestedAt: new Date(Date.now() - 60_000).toISOString() }} />
  </Frame>
);

/** A Super Diff is showing: the toggle switches back to bb's own list, and the line counts what the agent wrote. */
export const ShowingSuperDiff = () => (
  <Frame>
    <Row state={READY} />
  </Frame>
);

/** Two files have joined the diff since the Super Diff was written, so the row turns amber and offers Regenerate. */
export const OutOfDate = () => (
  <Frame>
    <Row state={READY} fileCount={FILE_COUNT + 2} />
  </Frame>
);

/** The list at the top of a Super Diff: each annotation's number, title, and line, which jumps to its card. One note's line has left the diff. */
export const AnnotationList = () => (
  <Frame>
    <NotesBox
      notes={[...FIXTURE_NOTES, { ...FIXTURE_NOTES[1]!, id: "gone", n: 5, line: null, path: "src/data/legacy-pricing.ts", title: "Kept for orders placed before the switch" }]}
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

/** A concern's heading with Diff Viewed installed: its viewed count, then each file and what its change does. Files that change the same mechanical way share one line. */
export const ConcernFileList = () => {
  const concern = FIXTURE.submission.concerns[4]!;
  return (
    <Frame>
      <ConcernHeader
        number={5}
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
