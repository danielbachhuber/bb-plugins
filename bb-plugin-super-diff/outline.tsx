// What the Diff tab shows of a Super Diff before its diff has loaded.
import { useMemo } from "react";
import { NotesBox, placeNotes } from "./annotations";
import { ConcernHeader } from "./concern";
import type { StoredSuperDiff } from "./grouping";

/** Grey lines in place of a diff that is not drawn yet. */
export function PatchSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 py-3" aria-hidden>
      {[85, 60, 72].map((width) => (
        <span key={width} className="block h-2.5 rounded" style={{ width: `${width}%`, background: "var(--muted)" }} />
      ))}
    </div>
  );
}

/**
 * The Super Diff before its diff has loaded: each concern's heading,
 * explanation, files, and annotations from the stored Super Diff alone, with
 * a grey card per file. Shown the moment the stored Super Diff is known, so
 * the reader can start on concern 1 while the patches load.
 */
export function OutlineList({ stored }: { stored: StoredSuperDiff }) {
  const concerns = stored.submission.concerns;
  const notes = useMemo(() => {
    const order = concerns.flatMap((concern) => concern.files);
    return placeNotes(
      stored.submission.annotations.map((note, index) => ({ ...note, id: `note-${index}` })),
      order,
      new Map(),
    );
  }, [stored, concerns]);
  return (
    <div aria-busy="true">
      {concerns.map((concern, index) => (
        <section key={concern.title}>
          <ConcernHeader
            number={index + 1}
            first={index === 0}
            title={concern.title}
            explanation={concern.explanation}
            files={concern.files.map((path) => ({ path, summary: concern.summaries?.[path] }))}
            others={concern.others}
            showList
            viewed={null}
            onJump={() => {}}
          >
            <NotesBox notes={notes.filter((note) => concern.files.includes(note.path))} onJump={() => {}} loading />
          </ConcernHeader>
          {concern.files.map((path) => (
            <div key={path} className="mb-3 rounded-lg border border-border">
              <div className="truncate border-b border-border px-3 py-2 font-mono text-xs font-medium text-foreground">{path}</div>
              <PatchSkeleton />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
